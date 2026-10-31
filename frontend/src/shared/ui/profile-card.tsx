import type { LucideIcon } from "lucide-react";
import { Button } from "./button";

interface ProfileRow {
  label: string;
  value: string;
  note?: string;
  noteIcon?: LucideIcon;
}

interface ProfileAction {
  icon: LucideIcon;
  title: string;
  meta: string;
  button: string;
  buttonIcon?: LucideIcon;
  onClick?: () => void;
}

interface ProfileHelper {
  icon?: LucideIcon;
  text: string;
}

interface ProfileCardProps {
  rows?: ProfileRow[];
  action?: ProfileAction;
  helper?: ProfileHelper;
}

export function ProfileCard({ rows, action, helper }: ProfileCardProps) {
  const ActionIcon = action?.icon;
  const ButtonIcon = action?.buttonIcon;
  const HelperIcon = helper?.icon;

  return (
    <section className="overflow-hidden rounded-xl border border-line-card bg-paper shadow-card">
      {rows?.length ? (
        <dl className="divide-y divide-rule">
          {rows.map(({ label, value, note, noteIcon: NoteIcon }) => (
            <div
              key={label}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-5 sm:px-6"
            >
              <dt className="w-full text-small leading-[normal] text-ink-3 sm:w-40 sm:shrink-0">
                {label}
              </dt>
              <dd className="min-w-0 flex-[1_1_14rem] text-body-strong break-words text-ink">
                {value}
              </dd>
              {note ? (
                <dd className="inline-flex items-center gap-1.25 text-caption text-ink-3">
                  {NoteIcon ? <NoteIcon aria-hidden="true" size={13} /> : null}
                  {note}
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}

      {action && ActionIcon ? (
        <div className="flex flex-wrap items-center gap-4 p-4 sm:p-6">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-desk text-ink-2">
            <ActionIcon aria-hidden="true" size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.75">
            <h2 className="text-body-strong font-semibold text-ink">
              {action.title}
            </h2>
            <p className="text-small leading-[normal] text-ink-3">{action.meta}</p>
          </div>
          <Button variant="secondary" onClick={action.onClick}>
            {ButtonIcon ? <ButtonIcon aria-hidden="true" size={14} /> : null}
            {action.button}
          </Button>
        </div>
      ) : null}

      {helper ? (
        <p className="flex items-center gap-2 border-t border-rule bg-desk px-4 py-3 text-small leading-[normal] text-ink-3 sm:px-6">
          {HelperIcon ? (
            <HelperIcon aria-hidden="true" size={14} className="shrink-0" />
          ) : null}
          <span className="min-w-0 break-words">{helper.text}</span>
        </p>
      ) : null}
    </section>
  );
}
