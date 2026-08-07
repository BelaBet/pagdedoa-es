import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { translateError } from "@/lib/translate-error";
import {
  createCostCenter,
  updateCostCenter,
  type CostCenterRow,
} from "@/lib/cost-centers.functions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  row: CostCenterRow | null;
  onSaved?: () => void;
}

export function CostCenterFormModal({ open, onOpenChange, tenantId, row, onSaved }: Props) {
  const createFn = useServerFn(createCostCenter);
  const updateFn = useServerFn(updateCostCenter);

  const [name, setName] = useState("");
  const [type, setType] = useState<"online" | "presencial" | "totem">("online");
  const [description, setDescription] = useState("");
  const [platformPct, setPlatformPct] = useState(4.15);
  const [allowsInst, setAllowsInst] = useState(true);
  const [maxInst, setMaxInst] = useState(12);
  const [displayOrder, setDisplayOrder] = useState(0);

  useEffect(() => {
    if (row) {
      setName(row.name);
      setType(row.type);
      setDescription(row.description ?? "");
      setPlatformPct(Number((row.split_platform_percent * 100).toFixed(2)));
      setAllowsInst(row.allows_installments);
      setMaxInst(row.max_installments);
      setDisplayOrder(row.display_order);
    } else {
      setName("");
      setType("online");
      setDescription("");
      setPlatformPct(4.15);
      setAllowsInst(true);
      setMaxInst(12);
      setDisplayOrder(0);
    }
  }, [row, open]);

  const mut = useMutation({
    mutationFn: async () => {
      const splitPlatform = Number((platformPct / 100).toFixed(4));
      const splitSeller = Number((1 - splitPlatform).toFixed(4));
      if (row) {
        return updateFn({
          data: {
            id: row.id,
            name,
            type,
            description: description || null,
            splitPlatformPercent: splitPlatform,
            splitSellerPercent: splitSeller,
            allowsInstallments: allowsInst,
            maxInstallments: maxInst,
            displayOrder,
          },
        });
      }
      return createFn({
        data: {
          tenantId,
          name,
          type,
          description: description || null,
          splitPlatformPercent: splitPlatform,
          splitSellerPercent: splitSeller,
          allowsInstallments: allowsInst,
          maxInstallments: maxInst,
          displayOrder,
        },
      });
    },
    onSuccess: () => {
      toast.success(row ? "Centro atualizado" : "Centro criado");
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(translateError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Editar centro de custo" : "Novo centro de custo"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cc-name">Nome</Label>
            <Input
              id="cc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Dízimo Online"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="presencial">Presencial</SelectItem>
                  <SelectItem value="totem">Totem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cc-order">Ordem de exibição</Label>
              <Input
                id="cc-order"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cc-desc">Descrição (opcional)</Label>
            <Textarea
              id="cc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cc-platform">Split plataforma (%)</Label>
              <Input
                id="cc-platform"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={platformPct}
                onChange={(e) => setPlatformPct(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Igreja recebe {(100 - platformPct).toFixed(2)}%
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Permite parcelar</Label>
              <div className="flex items-center gap-2 pt-2">
                <Switch checked={allowsInst} onCheckedChange={setAllowsInst} />
                <span className="text-sm text-muted-foreground">
                  {allowsInst ? "Sim" : "Apenas à vista"}
                </span>
              </div>
            </div>
          </div>
          {allowsInst && (
            <div className="grid gap-1.5">
              <Label htmlFor="cc-maxinst">Máximo de parcelas</Label>
              <Input
                id="cc-maxinst"
                type="number"
                min={1}
                max={12}
                value={maxInst}
                onChange={(e) => setMaxInst(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !name.trim()}>
            {mut.isPending ? "Salvando…" : row ? "Salvar alterações" : "Criar centro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
