"use client";

import { KeyRound, Lock, Mail, RotateCcwKey } from "lucide-react";
import { useAuthenticatedUser } from "@/entities/session";
import { ProfileCard } from "@/shared/ui/profile-card";

export function ProfileContent() {
  const { name, email } = useAuthenticatedUser();

  return (
    <div className="flex flex-col gap-8">
      <ProfileCard
        rows={[
          { label: "Nome", value: name },
          {
            label: "E-mail corporativo",
            value: email,
            note: "Gerenciado pela TI",
            noteIcon: Lock,
          },
        ]}
      />
      <ProfileCard
        action={{
          icon: KeyRound,
          title: "Senha",
          meta: "Alterada há 42 dias",
          button: "Redefinir senha",
          buttonIcon: RotateCcwKey,
        }}
        helper={{
          icon: Mail,
          text: `Enviaremos um link de redefinição para ${email}.`,
        }}
      />
    </div>
  );
}
