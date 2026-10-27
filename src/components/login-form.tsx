"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/lib/actions";
import { Button, Input, Label, Notice } from "./ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoFocus required />
      </div>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
