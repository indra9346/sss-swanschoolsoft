import "server-only";
import { cache } from "react";
import { db, rawDb } from "@/lib/db";
import { readSession } from "@/lib/tenant";

const DEFAULT_BRANDING = {
  id: "",
  slug: "swan-school",
  name: "Swan School",
  tagline: "Smarter Management. Better Learning. Brighter Future.",
  primaryColor: "#e11d48",
  secondaryColor: "#7c3aed",
  logoData: null as string | null,
  signatureData: null as string | null,
  address: "",
  phone: "",
  email: "",
  website: "",
  principalName: "",
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Branding/settings of the current school (session school, or the default school on the login page). */
export const getSchool = cache(async () => {
  try {
    const s = await readSession();
    const school = s
      ? await rawDb.school.findUnique({ where: { id: s.sid } })
      : await rawDb.school.findFirst({
          where: process.env.DEFAULT_SCHOOL_SLUG ? { slug: process.env.DEFAULT_SCHOOL_SLUG } : undefined,
          orderBy: { createdAt: "asc" },
        });
    if (school) return school;
  } catch {
    // Graceful fallback if database is not reachable at startup
  }
  return DEFAULT_BRANDING;
});

/** The academic year marked as current for the signed-in school. */
export const getCurrentYear = cache(async () => {
  try {
    return (
      (await db.academicYear.findFirst({ where: { isCurrent: true } })) ??
      (await db.academicYear.findFirst({ orderBy: { startDate: "desc" } }))
    );
  } catch {
    return null;
  }
});
