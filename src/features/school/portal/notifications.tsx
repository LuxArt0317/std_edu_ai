import { requestText } from "@/lib/decisions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { CrmUser } from "../../crm/authService";
import {
  createCommunicationRequest,
  decideCommunicationRequest,
  markNotificationRead,
} from "../platformRepository";
import type { PlatformData } from "../types";

import { roleNames } from "./shared";
export function NotificationCenter({
  data,
  currentUser,
  onClose,
  onChanged,
  onToast,
}: {
  data: PlatformData;
  currentUser: CrmUser;
  onClose: () => void;
  onChanged: () => void;
  onToast: (message: string) => void;
}) {
  const canApprove =
    currentUser.isOwner || ["admin", "support"].includes(currentUser.role);
  const recipients = data.profiles.filter(
    (profile) =>
      profile.id !== currentUser.id &&
      profile.accountStatus === "active" &&
      (currentUser.role !== "student" ||
        ["faculty", "advisor", "support", "admin"].includes(profile.role)),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="academic-modal notification-center max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications and messages"
      >
        <DialogDescription className="sr-only">
          Update the fields and save.
        </DialogDescription>
        <header>
          <div>

            <DialogTitle asChild>
              <h2>Notifications</h2>
            </DialogTitle>
            <p>
              Read updates or contact school staff.
            </p>
          </div>
          <Button variant="outline" aria-label="Close" type="button" onClick={onClose}>
            ×
          </Button>
        </header>
        <div className="notification-center-body">
          <section>
            <h3>Notifications</h3>
            {data.notifications.map((item) => (
              <Card key={item.id} className={item.readAt ? "read" : "unread"}>
                <div>
                  <b>{item.title}</b>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
                <p>{item.body}</p>
                <Button variant="outline"
                  type="button"
                  onClick={() =>
                    void markNotificationRead(item.id, !item.readAt)
                      .then(onChanged)
                      .catch((error: unknown) =>
                        onToast(
                          error instanceof Error
                            ? error.message
                            : "Notification update failed.",
                        ),
                      )
                  }
                >
                  {item.readAt ? "Mark unread" : "Mark read"}
                </Button>
              </Card>
            ))}
            {!data.notifications.length ? <p>No notifications yet.</p> : null}
          </section>
          <section>
            <h3>Contact staff</h3>
            <form
              className="academic-form"
              onSubmit={(event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                void createCommunicationRequest({
                  recipientId: String(f.get("recipientId")),
                  subject: String(f.get("subject")),
                  body: String(f.get("body")),
                  channel: "portal",
                })
                  .then(() => {
                    onToast("Message submitted for approved delivery.");
                    onChanged();
                    event.currentTarget.reset();
                  })
                  .catch((error: unknown) =>
                    onToast(
                      error instanceof Error
                        ? error.message
                        : "Message could not be submitted.",
                    ),
                  );
              }}
            >
              <Label>
                <span>Recipient</span>
                <NativeSelect name="recipientId" required>
                  <NativeSelectOption value="">
                    Choose a recipient
                  </NativeSelectOption>
                  {recipients.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {item.name} · {roleNames[item.role]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Label>
              <Label>
                <span>Subject</span>
                <Input name="subject" required minLength={2} maxLength={160} />
              </Label>
              <Label>
                <span>Message</span>
                <Textarea
                  name="body"
                  required
                  minLength={2}
                  maxLength={10000}
                  rows={5}
                />
              </Label>
              <Button>Submit message</Button>
            </form>
          </section>
          {canApprove ? (
            <section>
              <h3>Awaiting approval</h3>
              {data.communications
                .filter((item) => item.status === "pending")
                .map((item) => (
                  <Card key={item.id}>
                    <b>{item.subject}</b>
                    <p>{item.body}</p>
                    <small>
                      {data.profiles.find(
                        (profile) => profile.id === item.senderId,
                      )?.name ?? "Sender"}{" "}
                      →{" "}
                      {data.profiles.find(
                        (profile) => profile.id === item.recipientId,
                      )?.name ?? "Recipient"}
                    </small>
                    <div>
                      <Button variant="outline"
                        type="button"
                        onClick={async () => {
                          const reason = await requestText(
                            "Approval reason (at least 12 characters)",
                          );
                          if (reason)
                            void decideCommunicationRequest({
                              requestId: item.id,
                              approve: true,
                              reason,
                            })
                              .then(() => {
                                onToast(
                                  "Communication approved and delivered.",
                                );
                                onChanged();
                              })
                              .catch((error: unknown) =>
                                onToast(
                                  error instanceof Error
                                    ? error.message
                                    : "Approval failed.",
                                ),
                              );
                        }}
                      >
                        Approve & send
                      </Button>
                      <Button variant="outline"
                        type="button"
                        onClick={async () => {
                          const reason = await requestText(
                            "Rejection reason (at least 12 characters)",
                          );
                          if (reason)
                            void decideCommunicationRequest({
                              requestId: item.id,
                              approve: false,
                              reason,
                            })
                              .then(() => {
                                onToast("Communication rejected.");
                                onChanged();
                              })
                              .catch((error: unknown) =>
                                onToast(
                                  error instanceof Error
                                    ? error.message
                                    : "Rejection failed.",
                                ),
                              );
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </Card>
                ))}
              {!data.communications.some(
                (item) => item.status === "pending",
              ) ? (
                <p>No messages are waiting.</p>
              ) : null}
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
