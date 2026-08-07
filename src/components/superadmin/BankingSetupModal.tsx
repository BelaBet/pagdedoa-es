import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import {
  registerTenantRecipient,
  syncRecipientStatus,
  type TenantRecipientRow,
} from "@/lib/recipient-registration.functions";

const BANKS = [
  { code: "001", name: "Banco do Brasil" },
  { code: "033", name: "Santander" },
  { code: "077", name: "Inter" },
  { code: "104", name: "Caixa Econômica Federal" },
  { code: "237", name: "Bradesco" },
  { code: "341", name: "Itaú" },
  { code: "260", name: "Nubank" },
  { code: "290", name: "PagBank" },
  { code: "336", name: "C6 Bank" },
  { code: "748", name: "Sicredi" },
  { code: "756", name: "Sicoob" },
  { code: "323", name: "Mercado Pago" },
];

type Props = {
  tenant: TenantRecipientRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BankingSetupModal({ tenant, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const register = useServerFn(registerTenantRecipient);
  const sync = useServerFn(syncRecipientStatus);

  const isConfigured = Boolean(tenant.recipient_id) && tenant.recipient_status !== "error";

  const [legalName, setLegalName] = useState(tenant.legal_name ?? tenant.name ?? "");
  const [holderDocument, setHolderDocument] = useState(
    tenant.holder_document ?? tenant.document ?? "",
  );
  const [holderName, setHolderName] = useState(tenant.holder_name ?? "");
  const [bankCode, setBankCode] = useState(tenant.bank_code ?? "");
  const [bankAgency, setBankAgency] = useState(tenant.bank_agency ?? "");
  const [bankAccount, setBankAccount] = useState(tenant.bank_account ?? "");
  const [bankAccountDv, setBankAccountDv] = useState(tenant.bank_account_dv ?? "");
  const [accountType, setAccountType] = useState<"checking" | "savings">(
    (tenant.account_type as "checking" | "savings") ?? "checking",
  );

  const registerMutation = useMutation({
    mutationFn: () =>
      register({
        data: {
          tenantId: tenant.id,
          legalName,
          holderDocument: holderDocument.replace(/\D/g, ""),
          holderName,
          bankCode,
          bankAgency,
          bankAccount,
          bankAccountDv,
          accountType,
        },
      }),
    onSuccess: (res) => {
      toast.success(res.alreadyExists ? "Recebedor já existia" : "Recebedor configurado!");
      qc.invalidateQueries({ queryKey: ["superadmin-recipients"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const syncMutation = useMutation({
    mutationFn: () => sync({ data: { tenantId: tenant.id } }),
    onSuccess: (res) => {
      toast.success(`Status: ${res.status ?? "—"}`);
      qc.invalidateQueries({ queryKey: ["superadmin-recipients"] });
    },
    onError: (e) => toast.error(translateError(e)),
  });

  const copyRecipientId = async () => {
    if (!tenant.recipient_id) return;
    try {
      await navigator.clipboard.writeText(tenant.recipient_id);
      toast.success("recipient_id copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Recebedor Pagar.me — {tenant.name}</DialogTitle>
          <DialogDescription>
            {isConfigured
              ? "Esta igreja já possui um recebedor configurado. Você pode sincronizar o status."
              : "Cadastre os dados bancários para criar o recebedor na Pagar.me."}
          </DialogDescription>
        </DialogHeader>

        {isConfigured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <Badge>{tenant.recipient_status ?? "—"}</Badge>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
              <code className="flex-1 truncate text-xs">{tenant.recipient_id}</code>
              <Button size="icon" variant="ghost" onClick={copyRecipientId} aria-label="Copiar">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>Banco: {tenant.bank_code ?? "—"}</div>
              <div>Tipo: {tenant.account_type ?? "—"}</div>
              <div>Agência: {tenant.bank_agency ?? "—"}</div>
              <div>
                Conta: {tenant.bank_account ?? "—"}-{tenant.bank_account_dv ?? "—"}
              </div>
              <div className="col-span-2">Titular: {tenant.holder_name ?? "—"}</div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sincronizar status
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              registerMutation.mutate();
            }}
          >
            {tenant.recipient_error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                Erro anterior: {tenant.recipient_error}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="legalName">Razão social</Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="holderName">Nome do titular</Label>
                <Input
                  id="holderName"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="holderDocument">CPF/CNPJ do titular</Label>
                <Input
                  id="holderDocument"
                  value={holderDocument}
                  onChange={(e) => setHolderDocument(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="bankCode">Banco</Label>
              <Select value={bankCode} onValueChange={setBankCode}>
                <SelectTrigger id="bankCode">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="bankAgency">Agência</Label>
                <Input
                  id="bankAgency"
                  value={bankAgency}
                  onChange={(e) => setBankAgency(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bankAccount">Conta</Label>
                <Input
                  id="bankAccount"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bankAccountDv">Dígito</Label>
                <Input
                  id="bankAccountDv"
                  value={bankAccountDv}
                  onChange={(e) => setBankAccountDv(e.target.value)}
                  maxLength={2}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="accountType">Tipo de conta</Label>
              <Select
                value={accountType}
                onValueChange={(v) => setAccountType(v as "checking" | "savings")}
              >
                <SelectTrigger id="accountType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Corrente</SelectItem>
                  <SelectItem value="savings">Poupança</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={registerMutation.isPending || !bankCode}>
                {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar recebedor
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
