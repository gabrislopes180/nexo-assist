"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { homePathFor, useSession } from "@/entities/session";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { TextField } from "@/shared/ui/text-field";
import { useLogin } from "../api/use-login";
import {
  getLoginError,
  SESSION_NOT_KEPT_MESSAGE,
} from "../lib/login-error-message";
import {
  loginFormSchema,
  type LoginFormInput,
  type LoginFormValues,
} from "../model/login-schema";

export function LoginForm() {
  const router = useRouter();
  const { data: sessionUser } = useSession();
  const { mutate: signIn, isPending } = useLogin();
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  // O estado da mutation só muda no próximo render; a ref barra o duplo envio.
  const isSendingRef = useRef(false);

  const {
    control,
    handleSubmit,
    reset,
    register,
    setError,
    formState: { errors },
  } = useForm<LoginFormInput, unknown, LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "", keepConnected: true },
  });

  // O Next mantém a rota anterior oculta no DOM: sem isto, a senha ficaria lá
  // e voltaria preenchida depois de sair.
  useEffect(() => () => reset(), [reset]);

  // O login grava o usuário na mesma chave, então os dois caminhos passam aqui.
  useEffect(() => {
    if (sessionUser) router.replace(homePathFor(sessionUser.role));
  }, [router, sessionUser]);

  const isBusy = isPending || Boolean(sessionUser);

  const onSubmit = ({ email }: LoginFormValues) => {
    if (isBusy || isSendingRef.current) return;

    isSendingRef.current = true;
    signIn(email, {
      onSuccess: (user) => {
        if (!user) setBannerMessage(SESSION_NOT_KEPT_MESSAGE);
      },
      onError: (error) => {
        const { target, message } = getLoginError(error);
        if (target === "email") {
          setError("email", { message }, { shouldFocus: true });
        } else {
          setBannerMessage(message);
        }
      },
      onSettled: () => {
        isSendingRef.current = false;
      },
    });
  };

  return (
    // method="post": antes da hidratação, o envio nativo não põe a senha na URL.
    <form
      method="post"
      noValidate
      aria-busy={isBusy}
      onSubmit={(event) => {
        setBannerMessage(null);
        void handleSubmit(onSubmit)(event);
      }}
      className="flex w-full max-w-(--login-form-width) flex-col gap-7"
    >
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display-lg text-ink">Entrar</h1>
        <p className="text-subtitle text-ink-3">
          Use seu e-mail corporativo e a senha da rede Nexo.
        </p>
      </div>

      {bannerMessage ? (
        <p
          role="alert"
          className="rounded-md bg-danger-soft px-3.5 py-2.5 text-small text-danger-text"
        >
          {bannerMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-4.5">
        <TextField
          label="E-mail corporativo"
          icon={Mail}
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={isBusy}
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label="Senha"
          icon={LockKeyhole}
          type="password"
          autoComplete="current-password"
          readOnly={isBusy}
          error={errors.password?.message}
          labelAction={
            <button
              type="button"
              className="cursor-pointer rounded-xs text-label text-info-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
            >
              Esqueci minha senha
            </button>
          }
          {...register("password")}
        />
        <Controller
          control={control}
          name="keepConnected"
          render={({ field }) => (
            <Checkbox
              label="Manter conectado neste computador"
              name={field.name}
              ref={field.ref}
              checked={field.value}
              aria-disabled={isBusy || undefined}
              onBlur={field.onBlur}
              onCheckedChange={(checked) => {
                if (!isBusy) field.onChange(checked === true);
              }}
            />
          )}
        />
      </div>

      <Button
        type="submit"
        size="md"
        block
        aria-busy={isBusy}
        aria-disabled={isBusy}
        disabled={isBusy}
        iconRight={
          isBusy ? undefined : <ArrowRight aria-hidden="true" size={16} />
        }
      >
        {isBusy ? "Entrando..." : "Entrar"}
      </Button>

      <hr className="border-rule" />
    </form>
  );
}
