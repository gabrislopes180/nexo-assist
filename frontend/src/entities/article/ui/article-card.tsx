"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CATEGORY_LABELS } from "@/shared/config/ticket-category";
import { formatShortDate } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { StatusBadge } from "@/shared/ui/status-badge";
import { useArticle } from "../api/use-article";
import { articleFailure } from "../lib/article-failure";
import { ArticleError } from "./article-error";

interface ArticleCardProps {
  /** Vem de `trace.sources`: o título aparece antes de o artigo carregar. */
  slug: string;
  title: string;
}

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Artigo da central de ajuda citado pelo agent, abaixo da bolha. Abre o texto
 * completo ali mesmo (padrão de divulgação: o foco fica no botão do cabeçalho).
 */
export function ArticleCard({ slug, title }: ArticleCardProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const retriedRef = useRef(false);
  const bodyId = useId();
  const titleId = useId();
  const query = useArticle(slug);
  const article = query.data;
  const category = article?.category ? CATEGORY_LABELS[article.category] : null;
  const failure =
    open && query.isError && !article ? articleFailure(query.error) : null;
  const isLoading = open && query.isPending;
  // Sempre montada, fora do bloco `hidden`: região viva que já nasce cheia não é lida.
  const announcement = isLoading
    ? "Carregando artigo…"
    : (failure?.line ?? "");

  // Deu certo depois de "Tentar de novo": o botão some, o foco vai para o texto.
  useEffect(() => {
    if (!article || !retriedRef.current) return;
    retriedRef.current = false;
    if (document.activeElement === document.body) bodyRef.current?.focus();
  }, [article]);

  const collapse = () => {
    setOpen(false);
    const toggle = toggleRef.current;
    toggle?.focus();
    toggle?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  return (
    <section
      aria-labelledby={titleId}
      className="w-full max-w-(--agent-bubble-width) overflow-hidden rounded-xl border border-line-card bg-paper"
    >
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          // Falha da busca feita com o card fechado: ao abrir, tenta de novo.
          if (!open && query.isError && !article) void query.refetch();
          setOpen(!open);
        }}
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-desk focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cta"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-ink-3">
            <span className="inline-flex items-center gap-1.25 font-medium">
              <BookOpen aria-hidden="true" size={12} />
              Central de ajuda
            </span>
            {category ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-0.75 rounded-pill bg-rule"
                />
                <span className="sr-only">, </span>
                <span>{category}</span>
              </>
            ) : null}
            <span className="sr-only">: </span>
          </span>
          <span id={titleId} className="text-heading wrap-anywhere text-ink">
            {title}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 pt-px text-caption text-ink-2">
          {open ? "Recolher" : "Ler artigo"}
          <ChevronDown
            aria-hidden="true"
            size={14}
            className={cn(
              "motion-safe:transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <div
        ref={bodyRef}
        id={bodyId}
        hidden={!open}
        tabIndex={-1}
        className="border-t border-rule px-4 pt-3 pb-3.5 outline-none"
      >
        {isLoading ? (
          <div aria-hidden="true">
            <StatusBadge tone="info" pulse>
              Carregando artigo…
            </StatusBadge>
          </div>
        ) : null}
        {failure ? (
          <ArticleError
            failure={failure}
            retrying={query.isFetching}
            onRetry={() => {
              retriedRef.current = true;
              void query.refetch();
            }}
          />
        ) : null}

        {article ? (
          <div className="flex flex-col gap-3">
            {article.content.trim() === "" ? (
              <p className="text-caption text-ink-3">
                Este artigo está sem texto na central de ajuda.
              </p>
            ) : (
              <p className="text-body leading-normal wrap-anywhere whitespace-pre-line text-ink">
                {article.content}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              {article.updatedAt ? (
                <p className="text-caption text-ink-3">
                  Atualizado em {formatShortDate(article.updatedAt)}
                </p>
              ) : null}
              <Button variant="ghost" className="ml-auto" onClick={collapse}>
                Recolher artigo
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
