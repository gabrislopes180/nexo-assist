import { Button } from "@/shared/ui/button";
import type { ArticleFailure } from "../lib/article-failure";

interface ArticleErrorProps {
  failure: ArticleFailure;
  /** Nova tentativa em andamento: o botão fica, só troca o rótulo. */
  retrying: boolean;
  onRetry: () => void;
}

export function ArticleError({ failure, retrying, onRetry }: ArticleErrorProps) {
  const { line, retryable } = failure;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="text-caption text-danger-text">{line}</p>
      {retryable ? (
        <Button
          variant="secondary"
          aria-disabled={retrying ? true : undefined}
          onClick={() => {
            if (!retrying) onRetry();
          }}
        >
          {retrying ? "Tentando de novo" : "Tentar de novo"}
        </Button>
      ) : null}
    </div>
  );
}
