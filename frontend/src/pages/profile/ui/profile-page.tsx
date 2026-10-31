import type { Metadata } from "next";
import { TopBar } from "@/shared/ui/top-bar";
import { ProfileContent } from "./profile-content";

export const metadata: Metadata = {
  title: "Meu perfil | Nexo Assist",
};

export function ProfilePage() {
  return (
    <>
      <TopBar crumbs={["Service desk de TI", "Meu perfil"]} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-12">
        <div className="mx-auto flex w-full max-w-(--profile-width) flex-col gap-7.5">
          <div className="flex flex-col gap-1.25">
            <h1 className="text-page-title text-ink">Meu perfil</h1>
            <p className="text-body text-ink-3">
              Seus dados de acesso ao service desk de TI.
            </p>
          </div>
          <ProfileContent />
        </div>
      </div>
    </>
  );
}
