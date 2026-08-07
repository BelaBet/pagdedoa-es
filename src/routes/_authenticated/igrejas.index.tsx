import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Church } from "lucide-react";

export const Route = createFileRoute("/_authenticated/igrejas/")({
  component: IgrejasList,
});

function IgrejasList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Igrejas</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as igrejas cadastradas na plataforma.
          </p>
        </div>
        <Button asChild>
          <Link to="/igrejas/nova" search={{ tenantId: undefined }}>
            <Plus className="h-4 w-4" /> Nova igreja
          </Link>
        </Button>
      </div>

      <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Church className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-medium">Nenhuma igreja cadastrada</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Cadastre a primeira igreja para habilitar a identidade visual e o recebimento de
          contribuições.
        </p>
        <Button asChild className="mt-2">
          <Link to="/igrejas/onboarding">Iniciar cadastro</Link>
        </Button>
      </Card>
    </div>
  );
}
