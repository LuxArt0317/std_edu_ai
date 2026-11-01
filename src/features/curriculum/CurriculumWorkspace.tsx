import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FilePenLine, RefreshCw } from "lucide-react";
import { supabase } from "@/utils/supabase";
import type { Tables } from "@/types/database.generated";
import type { CrmUser } from "@/features/crm/authService";
import type { PlatformData, SchoolCourse } from "@/features/school/types";
import { WorkspaceDialog } from "@/components/workspace-dialog";
import { requestText } from "@/lib/decisions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Request = Tables<"curriculum_change_requests">;
const reviewerRoles = new Set([
  "owner",
  "admin",
  "dean",
  "registrar",
  "department_head",
]);
export function CurriculumRequests({
  currentUser,
  data,
  sectionId,
  onOpenProgram,
}: {
  currentUser: CrmUser;
  data: PlatformData;
  sectionId?: string;
  onOpenProgram?: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Request | null | undefined>();
  const reviewer = reviewerRoles.has(currentUser.role);
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from("curriculum_change_requests")
        .select("*", { count: "exact" })
        .range(page * 25, page * 25 + 24)
        .order("created_at", { ascending: false });
      if (sectionId) query = query.eq("section_id", sectionId);
      const result = await query;
      if (result.error) throw result.error;
      setRequests(result.data);
      setTotal(result.count ?? 0);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Curriculum requests could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [sectionId, page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function mutate(args: {
    p_action: string;
    p_request_id?: string;
    p_section_id?: string;
    p_summary?: string;
    p_details?: string;
    p_decision?: string;
    p_reason?: string;
  }) {
    if (!supabase) return;
    setBusy(true);
    try {
      const result = await supabase.rpc(
        "manage_curriculum_change_request",
        args,
      );
      if (result.error) throw result.error;
      setEditing(undefined);
      toast.success(
        "Curriculum request saved. The institutional curriculum is unchanged until an authorized editor applies the proposal.",
      );
      if (args.p_action === "create" && page !== 0) setPage(0);
      else await load();
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : "The request could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void mutate({
      p_action: editing ? "edit" : "create",
      ...(editing ? { p_request_id: editing.id } : { p_section_id: sectionId }),
      p_summary: String(form.get("summary")),
      p_details: String(form.get("details")),
    });
  }
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 py-5">
        <div className="grid gap-1">
          <CardTitle>
            {sectionId
              ? "Curriculum change requests"
              : "Change requests"}
          </CardTitle>
          <CardDescription>
            Review proposed changes before updating a curriculum.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button type="button"
            variant="outline"
            size="icon"
            aria-label="Refresh curriculum requests"
            onClick={() => void load()}
          >
            <RefreshCw />
          </Button>
          {sectionId ? (
            <Button variant="outline" type="button" onClick={() => setEditing(null)}>
              <FilePenLine />
              Request curriculum change
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 pb-5">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
            <Button type="button" variant="link" onClick={() => void load()}>
              Retry
            </Button>
          </p>
        ) : null}
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading curriculum requests…
          </p>
        ) : null}
        {!loading && !error && !requests.length ? (
          <p className="text-sm text-muted-foreground">
            No curriculum change requests yet.
          </p>
        ) : null}
        {!loading && !error ? requests.map((request) => (
          <div key={request.id} className="grid gap-3 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-sm font-semibold">{request.summary}</h3>
              <Badge variant="secondary">{request.status}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {request.details}
            </p>
            <p className="text-xs text-muted-foreground">{data.programs.find(program => program.id === request.program_id)?.code ?? 'Assigned program'} · {data.courses.find(course => course.sectionId === request.section_id)?.code ?? 'Assigned class'} · {data.profiles.find(profile => profile.id === request.requester_id)?.name ?? 'Authorized teacher'} · {new Date(request.created_at).toLocaleDateString()}</p>
          {request.review_reason ? (
              <p className="rounded-md bg-muted p-3 text-sm">
                Decision reason: {request.review_reason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {request.status === "submitted" &&
              request.requester_id === currentUser.id ? (
                <>
                  <Button type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setEditing(request)}
                  >
                    Edit request
                  </Button>
                  <Button type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      const reason = await requestText(
                        "Why are you withdrawing this request? At least 12 characters.",
                      );
                      if (reason)
                        await mutate({
                          p_action: "withdraw",
                          p_request_id: request.id,
                          p_reason: reason,
                        });
                    }}
                  >
                    Withdraw request
                  </Button>
                </>
              ) : null}
              {reviewer &&
              request.status === "submitted" &&
              request.requester_id !== currentUser.id ? (
                <>
                  <Button variant="outline" type="button"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      const reason = await requestText(
                        "Approval reason (at least 12 characters). Approval does not publish a curriculum.",
                      );
                      if (reason)
                        await mutate({
                          p_action: "review",
                          p_request_id: request.id,
                          p_decision: "approved",
                          p_reason: reason,
                        });
                    }}
                  >
                    Approve proposal
                  </Button>
                  <Button type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const reason = await requestText(
                        "Rejection reason (at least 12 characters).",
                      );
                      if (reason)
                        await mutate({
                          p_action: "review",
                          p_request_id: request.id,
                          p_decision: "rejected",
                          p_reason: reason,
                        });
                    }}
                  >
                    Reject proposal
                  </Button>
                </>
              ) : null}
              {onOpenProgram ? (
                <Button type="button"
                  variant="link"
                  size="sm"
                  onClick={() => onOpenProgram(request.program_id)}
                >
                  Open program curriculum
                </Button>
              ) : null}
            </div>
          </div>
        )) : null}
        {total > 25 ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Page {page+1} of {Math.ceil(total/25)} · {total} requests</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage(value => value-1)}>Previous</Button><Button type="button" variant="outline" size="sm" disabled={(page+1)*25 >= total || loading} onClick={() => setPage(value => value+1)}>Next</Button></div></div> : null}
      </CardContent>
      {editing !== undefined ? (
        <WorkspaceDialog
          title={
            editing ? "Edit curriculum request" : "Request curriculum change"
          }
          description="Describe the proposed change and why it is needed. An academic manager will review it."
          onClose={() => {
            if (!busy) setEditing(undefined);
          }}
        >
          <form onSubmit={submit} className="grid gap-5">
            <Label>
              Request summary
              <Input
                name="summary"
                required
                minLength={12}
                maxLength={160}
                defaultValue={editing?.summary}
              />
            </Label>
            <Label>
              Proposed change and rationale
              <Textarea
                name="details"
                required
                minLength={20}
                maxLength={10000}
                rows={6}
                defaultValue={editing?.details}
              />
            </Label>
            <Button disabled={busy} type="submit">
              {busy ? "Saving…" : "Submit curriculum request"}
            </Button>
          </form>
        </WorkspaceDialog>
      ) : null}
    </Card>
  );
}
export function CurriculumWorkspace({
  data,
  course,
  currentUser,
}: {
  data: PlatformData;
  course: SchoolCourse;
  currentUser: CrmUser;
}) {
  const subject = data.catalogCourses.find(
    (item) => item.id === course.courseId,
  );
  const program = data.programs.find((item) => item.id === subject?.programId);
  const plans = data.curricula.filter((plan) => plan.programId === program?.id);
  return (
    <section className="grid gap-5" aria-label="Assigned curriculum workspace">
      <Card>
        <CardHeader>
          <CardTitle>Assigned program curriculum</CardTitle>
          <CardDescription>
            {program
              ? `${program.code} · ${program.name}`
              : "The class is not linked to an academic program. Ask an academic manager to connect it before requesting curriculum changes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!plans.length ? (
            <p className="text-sm text-muted-foreground">
              No institutional curriculum is linked to this program yet. Course
              modules remain available in Content; use the request workflow to
              ask for a plan.
            </p>
          ) : null}
          {plans.map((plan) => (
            <div key={plan.id} className="grid gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  {plan.source.programCode} · {plan.effectiveYear}
                </h3>
                <Badge variant="secondary">{plan.status}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Semester</TableHead>
                    <TableHead>Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.source.subjects.map((item) => (
                    <TableRow key={item.code}>
                      <TableCell>
                        {item.code} · {item.title}
                      </TableCell>
                      <TableCell>{item.yearLevel}</TableCell>
                      <TableCell>{item.semester}</TableCell>
                      <TableCell>{item.units}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>
      {program ? (
        <CurriculumRequests
          key={course.sectionId}
          data={data}
          currentUser={currentUser}
          sectionId={course.sectionId}
        />
      ) : null}
    </section>
  );
}
