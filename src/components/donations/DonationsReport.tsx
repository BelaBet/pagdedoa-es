import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { jsPDF } from "jspdf";
import ticketConnectLogo from "@/assets/ticketconnect-logo.jpg";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brl, fmtDate, translateMethod, translateStatus } from "@/components/financeiro/format";
import {
  getDonationsReport,
  getTenantOptions,
  type DonationReportItem,
} from "@/lib/donations.functions";
import { getWithdrawalsReport, type WithdrawalReportItem } from "@/lib/recipient.functions";
import { useImpersonation } from "@/lib/impersonation";
import { usePagination } from "@/lib/use-pagination";
import { TablePagination } from "@/components/table-pagination";
import { Download, FileText, Inbox, Landmark } from "lucide-react";

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: toIso(start), periodEnd: toIso(now) };
}

function maskDocument(doc: string | null) {
  if (!doc) return "—";
  const digits = doc.replace(/\D+/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function buildPdf(
  items: DonationReportItem[],
  withdrawalItems: WithdrawalReportItem[],
  periodStart: string,
  periodEnd: string,
  isPlatformAdmin: boolean,
  tenantLabel: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 32;
  let y = 40;

  try {
    const logo = await loadImage(ticketConnectLogo);
    const logoHeight = 26;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    doc.addImage(logo, "JPEG", pageWidth - marginX - logoWidth, 24, logoWidth, logoHeight);
  } catch {
    // segue sem a logo se a imagem não carregar por algum motivo
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Relatório de Doações", marginX, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Instituição: ${tenantLabel}`, marginX, y);
  y += 13;
  doc.text(
    `Período: ${fmtDate(`${periodStart}T00:00:00`)} a ${fmtDate(`${periodEnd}T00:00:00`)}`,
    marginX,
    y,
  );
  y += 13;
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, marginX, y);
  y += 20;

  const columns = isPlatformAdmin
    ? [
        { key: "createdAt", label: "Data", width: 55 },
        { key: "tenantName", label: "Instituição", width: 90 },
        { key: "donorName", label: "Doador", width: 100 },
        { key: "donorDocument", label: "CPF/CNPJ", width: 75 },
        { key: "donorPhone", label: "Telefone", width: 70 },
        { key: "donorEmail", label: "E-mail", width: 110 },
        { key: "paymentMethod", label: "Pagamento", width: 65 },
        { key: "donationAmountCents", label: "Valor da Doação", width: 75 },
        { key: "adminFeeCents", label: "Taxa", width: 65 },
      ]
    : [
        { key: "createdAt", label: "Data", width: 60 },
        { key: "donorName", label: "Doador", width: 130 },
        { key: "donorDocument", label: "CPF/CNPJ", width: 90 },
        { key: "donorPhone", label: "Telefone", width: 85 },
        { key: "donorEmail", label: "E-mail", width: 150 },
        { key: "paymentMethod", label: "Pagamento", width: 80 },
        { key: "donationAmountCents", label: "Valor da Doação", width: 100 },
        { key: "adminFeeCents", label: "Taxa", width: 90 },
      ];

  const rowHeight = 16;
  const headerHeight = 18;

  function drawHeader() {
    doc.setFillColor(230, 224, 209); // cream/olive tone consistente com o design system
    doc.rect(marginX, y, pageWidth - marginX * 2, headerHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = marginX + 4;
    for (const col of columns) {
      doc.text(col.label, x, y + 12);
      x += col.width;
    }
    y += headerHeight;
  }

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  let totalDonation = 0;
  let totalFee = 0;

  for (const item of items) {
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      y = 40;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    }

    let x = marginX + 4;
    const values: Record<string, string> = {
      createdAt: fmtDate(item.createdAt),
      tenantName: item.tenantName ?? "—",
      donorName: item.donorName ?? "—",
      donorDocument: maskDocument(item.donorDocument),
      donorPhone: item.donorPhone ?? "—",
      donorEmail: item.donorEmail ?? "—",
      paymentMethod: translateMethod(item.paymentMethod) + (item.cardBrand ? ` (${item.cardBrand})` : ""),
      donationAmountCents: brl(item.donationAmountCents),
      adminFeeCents: brl(item.adminFeeCents),
    };

    for (const col of columns) {
      const raw = values[col.key] ?? "—";
      const text = doc.splitTextToSize(raw, col.width - 6)[0] ?? raw;
      const isNumeric = col.key.endsWith("Cents");
      if (isNumeric) {
        doc.text(String(text), x + col.width - 4, y + 11, { align: "right" });
      } else {
        doc.text(String(text), x, y + 11);
      }
      x += col.width;
    }
    y += rowHeight;

    totalDonation += item.donationAmountCents;
    totalFee += item.adminFeeCents;
  }

  y += 10;
  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Total de doações: ${items.length}`, marginX, y);
  doc.text(`Valor total das doações: ${brl(totalDonation)}`, marginX + 180, y);
  doc.text(`Total de taxa de administração: ${brl(totalFee)}`, marginX + 400, y);

  // ── Seção de retiradas / saques / antecipações ──────────────────────────
  if (withdrawalItems.length > 0) {
    y += 30;
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      y = 40;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Retiradas e Antecipações", marginX, y);
    y += 18;

    const wColumns = [
      { key: "createdAt", label: "Data", width: 90 },
      { key: "type", label: "Tipo", width: 100 },
      { key: "status", label: "Status", width: 90 },
      { key: "amountCents", label: "Valor", width: 100 },
      { key: "feeCents", label: "Taxa", width: 100 },
    ];

    function drawWHeader() {
      doc.setFillColor(230, 224, 209);
      doc.rect(marginX, y, pageWidth - marginX * 2, headerHeight, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      let x = marginX + 4;
      for (const col of wColumns) {
        doc.text(col.label, x, y + 12);
        x += col.width;
      }
      y += headerHeight;
    }

    drawWHeader();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    let totalWithdrawn = 0;
    let totalWithdrawalFee = 0;
    const typeLabel: Record<string, string> = { transfer: "Retirada (saque)", anticipation: "Antecipação" };
    const statusLabel: Record<string, string> = {
      paid: "Pago", transferred: "Transferido", pending: "Pendente",
      processing: "Processando", failed: "Falhou", canceled: "Cancelado",
    };

    for (const w of withdrawalItems) {
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 40;
        drawWHeader();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }
      let x = marginX + 4;
      const values: Record<string, string> = {
        createdAt: fmtDate(w.createdAt),
        type: typeLabel[w.type] ?? w.type,
        status: statusLabel[w.status] ?? w.status,
        amountCents: brl(w.amountCents),
        feeCents: brl(w.feeCents),
      };
      for (const col of wColumns) {
        doc.text(values[col.key] ?? "—", x, y + 11);
        x += col.width;
      }
      y += rowHeight;
      totalWithdrawn += w.amountCents;
      totalWithdrawalFee += w.feeCents;
    }

    y += 10;
    doc.setDrawColor(200);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Total de retiradas/antecipações: ${withdrawalItems.length}`, marginX, y);
    doc.text(`Valor total retirado: ${brl(totalWithdrawn)}`, marginX + 220, y);
    doc.text(`Taxa de antecipação total: ${brl(totalWithdrawalFee)}`, marginX + 420, y);
  }

  const fileName = `relatorio-doacoes_${periodStart}_a_${periodEnd}.pdf`;
  doc.save(fileName);
}

export function DonationsReport({ showTenantFilter = true }: { showTenantFilter?: boolean } = {}) {
  const [period, setPeriod] = useState(currentMonthRange);
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const { active: impersonating, tenantId: impersonatedTenantId } = useImpersonation();

  const reportFn = useServerFn(getDonationsReport);
  const tenantsFn = useServerFn(getTenantOptions);

  const tenants = useQuery({
    queryKey: ["donation-tenant-options"],
    queryFn: () => tenantsFn(),
    enabled: showTenantFilter && !impersonating,
  });
  const isPlatformView =
    showTenantFilter && !impersonating && (tenants.data?.isPlatformAdmin ?? false);

  // Impersonação força o escopo para a igreja acessada, ignorando o filtro
  // "Todas as instituições" (o super admin tem acesso real, mas essa tela
  // deve refletir apenas a igreja em que ele está atuando).
  const effectiveTenantId =
    impersonating && impersonatedTenantId
      ? impersonatedTenantId
      : tenantFilter !== "all"
        ? tenantFilter
        : undefined;

  const report = useQuery({
    queryKey: ["donations-report", period, effectiveTenantId ?? "all"],
    queryFn: () =>
      reportFn({
        data: {
          ...period,
          tenantId: effectiveTenantId,
        },
      }),
  });

  const items = report.data?.items ?? [];
  const isPlatformAdmin = showTenantFilter && !impersonating && (report.data?.isPlatformAdmin ?? false);
  const totalDonation = items.reduce((sum, i) => sum + i.donationAmountCents, 0);
  const totalFee = items.reduce((sum, i) => sum + i.adminFeeCents, 0);
  // Paginação é só da pré-visualização em tela — o PDF (buildPdf) sempre
  // usa "items" completo, nunca a fatia paginada, senão o relatório
  // baixado sairia incompleto.
  const itemsPg = usePagination(items, 10);

  // Saques/retiradas e antecipações: sempre disponível para a igreja (própria
  // instituição). Para o super admin só faz sentido quando uma instituição
  // específica está selecionada — "Todas as instituições" não tem um único
  // recipient para consultar no Pagar.me.
  const withdrawalsFn = useServerFn(getWithdrawalsReport);
  const canLoadWithdrawals = !isPlatformView || effectiveTenantId !== undefined;
  const withdrawals = useQuery({
    queryKey: ["withdrawals-report", period, effectiveTenantId ?? "all"],
    enabled: canLoadWithdrawals,
    queryFn: () =>
      withdrawalsFn({
        data: {
          ...period,
          tenantId: isPlatformView ? effectiveTenantId : undefined,
        },
      }),
  });
  const withdrawalItems = withdrawals.data?.items ?? [];
  const totalWithdrawals = withdrawalItems.reduce((s, w) => s + w.amountCents, 0);
  // Mesma regra: o PDF sempre usa withdrawalItems completo.
  const withdrawalsPg = usePagination(withdrawalItems, 10);

  const tenantLabel = isPlatformAdmin
    ? tenantFilter === "all"
      ? "Todas as instituições"
      : (tenants.data?.items.find((t) => t.id === tenantFilter)?.name ?? "—")
    : "—"; // igreja resolve o próprio nome no PDF via tenant do usuário; deixado neutro aqui

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Relatório completo de doações com dados captados no pagamento e taxa de administração
          consolidada.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="periodStart">De</Label>
          <Input
            id="periodStart"
            type="date"
            value={period.periodStart}
            onChange={(e) => setPeriod((p) => ({ ...p, periodStart: e.target.value }))}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="periodEnd">Até</Label>
          <Input
            id="periodEnd"
            type="date"
            value={period.periodEnd}
            onChange={(e) => setPeriod((p) => ({ ...p, periodEnd: e.target.value }))}
            className="w-40"
          />
        </div>
        {isPlatformView && (
          <div className="space-y-1">
            <Label>Instituição</Label>
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Todas as instituições" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as instituições</SelectItem>
                {tenants.data?.items.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          onClick={async () => {
            setGeneratingPdf(true);
            try {
              await buildPdf(items, withdrawalItems, period.periodStart, period.periodEnd, isPlatformAdmin, tenantLabel);
            } finally {
              setGeneratingPdf(false);
            }
          }}
          disabled={(items.length === 0 && withdrawalItems.length === 0) || generatingPdf}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          {generatingPdf ? "Gerando..." : "Baixar PDF"}
        </Button>
      </div>

      {report.isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 opacity-40" />
            <p className="text-sm">Nenhuma doação encontrada no período.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{items.length}</strong> doações
            </span>
            <span>
              Valor total das doações: <strong className="text-foreground">{brl(totalDonation)}</strong>
            </span>
            <span>
              Taxa de administração total: <strong className="text-foreground">{brl(totalFee)}</strong>
            </span>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    {isPlatformAdmin && <TableHead>Instituição</TableHead>}
                    <TableHead>Doador</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="w-32 text-right">Valor da Doação</TableHead>
                    <TableHead className="w-24 text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsPg.paginated.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-muted-foreground">{fmtDate(d.createdAt)}</TableCell>
                      {isPlatformAdmin && (
                        <TableCell className="text-muted-foreground">{d.tenantName ?? "—"}</TableCell>
                      )}
                      <TableCell className="font-medium">{d.donorName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{maskDocument(d.donorDocument)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex flex-col">
                          <span>{d.donorPhone ?? "—"}</span>
                          <span className="text-xs">{d.donorEmail ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {translateMethod(d.paymentMethod)}
                        {d.cardBrand ? ` · ${d.cardBrand}` : ""}
                      </TableCell>
                      <TableCell className="w-32 text-right font-medium tabular-nums">{brl(d.donationAmountCents)}</TableCell>
                      <TableCell className="w-24 text-right text-muted-foreground tabular-nums">
                        {brl(d.adminFeeCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <TablePagination
              page={itemsPg.page}
              totalPages={itemsPg.totalPages}
              total={itemsPg.total}
              start={itemsPg.start}
              end={itemsPg.end}
              onPageChange={itemsPg.setPage}
              itemLabel={itemsPg.total === 1 ? "doação" : "doações"}
            />
          </Card>
        </>
      )}

      {/* Retiradas (saques) e antecipações — mesmos dados já incluídos no PDF,
          agora também visíveis na pré-visualização antes de baixar. */}
      {withdrawals.isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : withdrawals.data?.unavailable ? (
        <p className="text-xs text-muted-foreground">
          Retiradas e antecipações não ficam disponíveis para "Todas as instituições" — selecione uma
          instituição específica para ver esses dados.
        </p>
      ) : withdrawalItems.length > 0 ? (
        <>
          <div>
            <h2 className="font-display text-xl">Retiradas e antecipações</h2>
            <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>
                <strong className="text-foreground">{withdrawalItems.length}</strong> movimentações
              </span>
              <span>
                Valor total: <strong className="text-foreground">{brl(totalWithdrawals)}</strong>
              </span>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawalsPg.paginated.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="text-muted-foreground">{fmtDate(w.createdAt)}</TableCell>
                      <TableCell className="font-medium">
                        {w.type === "transfer" ? "Retirada (saque)" : "Antecipação"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{translateStatus(w.status)}</TableCell>
                      <TableCell className="text-right font-medium">{brl(w.amountCents)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {w.feeCents > 0 ? brl(w.feeCents) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <TablePagination
              page={withdrawalsPg.page}
              totalPages={withdrawalsPg.totalPages}
              total={withdrawalsPg.total}
              start={withdrawalsPg.start}
              end={withdrawalsPg.end}
              onPageChange={withdrawalsPg.setPage}
              itemLabel={withdrawalsPg.total === 1 ? "movimentação" : "movimentações"}
            />
          </Card>
        </>
      ) : null}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        O PDF inclui todos os dados exibidos acima, com totais consolidados no rodapé.
      </p>
    </div>
  );
}
