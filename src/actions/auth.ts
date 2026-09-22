"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { rawDb } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { fail, str, type ActionState } from "@/lib/action";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return fail("Enter your email and password.");

  try {
    const user = await rawDb.user.findUnique({ where: { email } });
    const valid = user && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !valid) return fail("Incorrect email or password.");
    if (!user.active) return fail("This account has been deactivated. Contact your school admin.");
    if (user.role === "PARENT") {
      return fail("Parent Portal is not active under your current plan. Contact Swan Digital Solutions to unlock it.");
    }

    await createSession(user.id, user.schoolId, user.role);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "digest" in err && String((err as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return fail("Database connection is not available. Please verify DATABASE_URL is configured in your deployment settings.");
  }
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
