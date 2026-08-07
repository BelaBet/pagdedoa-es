import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QrCode, Download } from "lucide-react";
import { toast } from "sonner";

/**
 * QR Code gerado dinamicamente no cliente a partir da URL atual — nunca
 * fica desatualizado, ao contrário da imagem estática que era gerada uma
 * única vez no onboarding e salva em cost_centers.qr_code_url (que ficava
 * apontando pro link antigo se o slug da instituição mudasse depois).
 */
export function DynamicQrButton({
  url,
  fileName,
  primary = "#0F172A",
}: {
  url: string;
  fileName: string;
  primary?: string;
}) {
  const qrRef = useRef<HTMLDivElement>(null);

  if (!url) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Ver QR Code">
          <QrCode className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto space-y-3 p-4" align="end">
        <div ref={qrRef} className="rounded-lg bg-white p-3 shadow-sm">
          <QRCodeCanvas value={url} size={160} level="M" includeMargin={false} fgColor={primary} />
        </div>
        <p className="max-w-[160px] break-all text-center text-[10px] text-muted-foreground">
          {url}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          onClick={() => {
            const canvas = qrRef.current?.querySelector("canvas");
            if (!canvas) return;
            const link = document.createElement("a");
            link.download = `${fileName}.png`;
            link.href = (canvas as HTMLCanvasElement).toDataURL("image/png");
            link.click();
            toast.success("QR Code baixado!");
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Baixar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
