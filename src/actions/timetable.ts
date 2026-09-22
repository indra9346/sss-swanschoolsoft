"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, requireActionUser } from "@/lib/auth";
import { ok, parse, run, UserError, type ActionState } from "@/lib/action";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use the 24-hour format HH:MM");

const TT_MSG = {
  teacherBusy: "This teacher is already teaching another class during this time.",
  classBusy: "This class already has period scheduled during this time.",
  badTime: "The end time must be later than the start time.",
  duplicate: "This timetable entry already exists.",
} as const;

/**
 * Create or update one timetable slot for a given class, day, and period.
 * ADMIN or TEACHER (for allocated subjects).
 * Checks: valid times · subject allocated to the class · teacher active · class time overlap · teacher time overlap.
 * Every lookup is school-scoped, so records from another school are not accessible.
 */
export async function saveSlotAction(
  classId: string,
  day: number,
  period: number,
  _: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return run(async () => {
    const user = await requireActionUser(["ADMIN", "TEACHER"], "timetable");
    const d = parse(
      z.object({
        subjectId: z.string().min(1, "Choose a subject"),
        startTime: time,
        endTime: time,
        room: z.string().max(20).optional(),
      }),
      fd,
    );

    if (d.endTime <= d.startTime) throw new UserError(TT_MSG.badTime);

    const [cls, alloc] = await Promise.all([
      db.classRoom.findUnique({ where: { id: classId } }),
      db.allocation.findUnique({
        where: { classId_subjectId: { classId, subjectId: d.subjectId } },
        include: { teacher: { include: { user: true } } },
      }),
    ]);

    if (!cls) throw new UserError("Class not found.");
    if (!alloc) throw new UserError("This subject is not allocated to the class yet. Allocate a teacher first.");
    if (user.role === "TEACHER" && alloc.teacherId !== user.staff?.id) {
      throw new UserError("You cannot schedule a subject you don't teach.");
    }
    if (!alloc.teacher || alloc.teacher.staffType !== "TEACHING" || !alloc.teacher.user.active) {
      throw new UserError("Choose an active teacher.");
    }

    const existing = await db.timetableSlot.findUnique({
      where: { classId_day_period: { classId, day, period } },
    });
    const self = existing ? { NOT: { id: existing.id } } : {};

    // 1. Class clash: same class, same day, different period but overlapping time
    const classClash = await db.timetableSlot.findFirst({
      where: {
        classId,
        day,
        period: { not: period },
        startTime: { lt: d.endTime },
        endTime: { gt: d.startTime },
        ...self,
      },
    });
    if (classClash) throw new UserError(TT_MSG.classBusy);

    // 2. Teacher clash: same teacher, same day, overlapping time in ANY class of the school
    const teacherClash = await db.timetableSlot.findFirst({
      where: {
        teacherId: alloc.teacherId,
        day,
        startTime: { lt: d.endTime },
        endTime: { gt: d.startTime },
        ...self,
      },
    });
    if (teacherClash) throw new UserError(TT_MSG.teacherBusy);

    const data = {
      subjectId: d.subjectId,
      teacherId: alloc.teacherId,
      startTime: d.startTime,
      endTime: d.endTime,
      room: d.room || null,
    };

    if (existing) {
      await db.timetableSlot.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await db.timetableSlot.create({
        data: {
          schoolId: user.schoolId,
          classId,
          day,
          period,
          ...data,
        },
      });
    }

    revalidatePath("/timetable");
    revalidatePath("/dashboard");
    return ok("Timetable entry saved.");
  });
}

/**
 * Clear one slot for a class at day and period.
 * Idempotent: if already removed, returns success.
 */
export async function clearSlotAction(
  classId: string,
  day: number,
  period: number,
): Promise<ActionState> {
  return run(async () => {
    const user = await requireActionUser(["ADMIN", "TEACHER"], "timetable");
    const slot = await db.timetableSlot.findUnique({
      where: { classId_day_period: { classId, day, period } },
    });
    if (!slot) return ok("This entry was already removed.");
    if (user.role === "TEACHER" && slot.teacherId !== user.staff?.id) {
      throw new UserError("You can only clear periods for subjects you teach.");
    }

    await db.timetableSlot.deleteMany({ where: { id: slot.id } });
    revalidatePath("/timetable");
    revalidatePath("/dashboard");
    return ok("Timetable entry cleared.");
  });
}

/** Delete one entry by slot ID. */
export async function deleteSlotAction(slotId: string): Promise<ActionState> {
  return run(async () => {
    const user = await requireActionUser(["ADMIN", "TEACHER"], "timetable");
    const slot = await db.timetableSlot.findUnique({ where: { id: slotId } });
    if (!slot) return ok("This entry was already removed.");
    if (user.role === "TEACHER" && slot.teacherId !== user.staff?.id) {
      throw new UserError("You can only clear periods for subjects you teach.");
    }
    await db.timetableSlot.deleteMany({ where: { id: slotId } });
    revalidatePath("/timetable");
    revalidatePath("/dashboard");
    return ok("Timetable entry deleted.");
  });
}
