import { Check, Plus, Trash2, X } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Avatar, Badge, Empty, PageHeader, Tile } from "@/components/ui";
import { ActionForm, ConfirmButton, Field, Modal, SubmitButton } from "@/components/form";
import { applyLeaveAction, cancelLeaveAction, reviewLeaveAction } from "@/actions/leave";
import { LEAVE_TYPES, fmtDate, fmtDateTime, todayISO, toDate } from "@/lib/utils";

export const metadata = { title: "Staff Leave" };

const STATUS = { PENDING: "#d97706", APPROVED: "#059669", REJECTED: "#e11d48" } as const;

export default async function LeavePage() {
  const user = await requireUser(["ADMIN", "TEACHER"], "leave");
  return user.role === "ADMIN" ? <AdminLeave /> : <TeacherLeave staffId={user.staff!.id} />;
}

/* -------------------------------------------------------------- teacher */
async function TeacherLeave({ staffId }: { staffId: string }) {
  const today = todayISO();
  const year = today.slice(0, 4);
  const leaves = await db.leaveRequest.findMany({ where: { staffId }, orderBy: { createdAt: "desc" } });
  const used = (t: keyof typeof LEAVE_TYPES) =>
    leaves.filter((l) => l.type === t && l.status !== "REJECTED" && l.fromDate >= toDate(`${year}-01-01`)).reduce((s, l) => s + l.days, 0);

  return (
    <div>
      <PageHeader
        title="My Leave"
        subtitle="Apply for leave and track admin approval"
        icon="leave"
        color="linear-gradient(135deg,#ec4899,#f43f5e)"
        actions={
          <Modal title="Apply for leave" trigger={<button className="btn btn-primary"><Plus size={16} /> Apply for leave</button>}>
            <ActionForm action={applyLeaveAction}>
              <Field label="Leave type" name="type">
                <select id="type" name="type" className="select" defaultValue="" required>
                  <option value="" disabled>Choose…</option>
                  {Object.entries(LEAVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.quota - used(k as keyof typeof LEAVE_TYPES)} left)</option>)}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From" name="fromDate"><input id="fromDate" name="fromDate" type="date" className="input" defaultValue={today} required /></Field>
                <Field label="To" name="toDate"><input id="toDate" name="toDate" type="date" className="input" defaultValue={today} required /></Field>
              </div>
              <Field label="Reason" name="reason"><textarea id="reason" name="reason" className="textarea" required placeholder="Briefly explain the reason…" /></Field>
              <div className="flex justify-end"><SubmitButton>Submit request</SubmitButton></div>
            </ActionForm>
          </Modal>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {(Object.keys(LEAVE_TYPES) as (keyof typeof LEAVE_TYPES)[]).map((k, i) => (
          <Tile key={k} label={LEAVE_TYPES[k].label} value={LEAVE_TYPES[k].quota - used(k)} tone={(["blue", "pink", "orange"] as const)[i]} icon="leave" sub={`days left of ${LEAVE_TYPES[k].quota} · ${used(k)} used/pending`} />
        ))}
      </div>
      {leaves.length === 0 ? <Empty title="No leave requests yet" hint="Use “Apply for leave” to submit your first request." /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Admin remark</th><th /></tr></thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.id}>
                  <td><Badge color={LEAVE_TYPES[l.type].color}>{LEAVE_TYPES[l.type].label}</Badge></td>
                  <td className="whitespace-nowrap">{fmtDate(l.fromDate)}{l.days > 1 && ` → ${fmtDate(l.toDate)}`}</td>
                  <td className="font-bold">{l.days}</td>
                  <td className="max-w-xs">{l.reason}</td>
                  <td><Badge color={STATUS[l.status]}>{l.status}</Badge></td>
                  <td className="text-[color:var(--ink-soft)]">{l.remark ?? "—"}</td>
                  <td className="text-right">{l.status === "PENDING" && <ConfirmButton confirm="Cancel this request?" action={cancelLeaveAction.bind(null, l.id)}><Trash2 size={14} /></ConfirmButton>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- admin */
async function AdminLeave() {
  const leaves = await db.leaveRequest.findMany({ include: { staff: { include: { user: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const pending = leaves.filter((l) => l.status === "PENDING");
  const history = leaves.filter((l) => l.status !== "PENDING");

  const review = (id: string, decision: "APPROVED" | "REJECTED", name: string) => (
    <Modal
      title={`${decision === "APPROVED" ? "Approve" : "Reject"} leave — ${name}`}
      trigger={decision === "APPROVED" ? <button className="btn btn-green btn-sm"><Check size={14} /> Approve</button> : <button className="btn btn-danger btn-sm"><X size={14} /> Reject</button>}
    >
      <ActionForm action={reviewLeaveAction.bind(null, id, decision)}>
        <Field label="Remark (optional)" name="remark"><input id="remark" name="remark" className="input" maxLength={300} placeholder="Visible to the teacher" /></Field>
        <div className="flex justify-end"><SubmitButton className={decision === "APPROVED" ? "btn btn-green" : "btn btn-danger"}>{decision === "APPROVED" ? "Confirm approval" : "Confirm rejection"}</SubmitButton></div>
      </ActionForm>
    </Modal>
  );

  return (
    <div>
      <PageHeader title="Staff Leave" subtitle="Review leave requests — approved leave is marked automatically in staff attendance" icon="leave" color="linear-gradient(135deg,#ec4899,#f43f5e)" />
      <h2 className="section-title mb-3">Pending approval ({pending.length})</h2>
      {pending.length === 0 ? <div className="mb-8"><Empty title="All caught up 🎉" hint="There are no pending leave requests." /></div> : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {pending.map((l) => (
            <div key={l.id} className="card card-pad">
              <div className="flex items-center gap-3">
                <Avatar name={l.staff.user.name} seed={l.staff.user.email} size={42} />
                <div className="flex-1">
                  <div className="font-bold text-[color:var(--ink-strong)]">{l.staff.user.name}</div>
                  <div className="text-xs text-[color:var(--ink-soft)]">Applied {fmtDateTime(l.createdAt)}</div>
                </div>
                <Badge color={LEAVE_TYPES[l.type].color}>{LEAVE_TYPES[l.type].label}</Badge>
              </div>
              <div className="mt-3 rounded-xl bg-[color:var(--brand2-soft)] p-3 text-sm">
                <b>{fmtDate(l.fromDate)}</b>{l.days > 1 && <> → <b>{fmtDate(l.toDate)}</b></>} · {l.days} day{l.days > 1 ? "s" : ""}
                <div className="mt-1 text-[color:var(--ink-soft)]">{l.reason}</div>
              </div>
              <div className="mt-3 flex justify-end gap-2">{review(l.id, "REJECTED", l.staff.user.name)}{review(l.id, "APPROVED", l.staff.user.name)}</div>
            </div>
          ))}
        </div>
      )}
      <h2 className="section-title mb-3">History</h2>
      {history.length === 0 ? <Empty title="No reviewed requests yet" /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Staff</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Remark</th></tr></thead>
            <tbody>
              {history.map((l) => (
                <tr key={l.id}>
                  <td className="font-bold text-[color:var(--ink-strong)]">{l.staff.user.name}</td>
                  <td><Badge color={LEAVE_TYPES[l.type].color}>{LEAVE_TYPES[l.type].label}</Badge></td>
                  <td className="whitespace-nowrap">{fmtDate(l.fromDate)}{l.days > 1 && ` → ${fmtDate(l.toDate)}`}</td>
                  <td>{l.days}</td><td><Badge color={STATUS[l.status]}>{l.status}</Badge></td><td className="text-[color:var(--ink-soft)]">{l.remark ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
