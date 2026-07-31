import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen } from "lucide-react";
import { MetricCalculationGuide } from "@/components/MetricCalculationGuide";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings/calculation-guide")({
  component: CalculationGuidePage,
});

function CalculationGuidePage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" asChild title="Back to Settings">
            <Link to="/settings"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <h1 className="font-display text-3xl font-semibold">Calculation Guide</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">How every dashboard value is calculated from uploads and manual inputs.</p>
          </div>
        </div>
      </header>

      <MetricCalculationGuide />
    </div>
  );
}
