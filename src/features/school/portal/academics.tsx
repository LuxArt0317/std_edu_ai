import type { CrmUser } from "../../crm/authService";
import { AcademicOperations } from "../AcademicOperations";
import type { PlatformData } from "../types";

import { PageIntro } from "./shared";
export function AcademicsView({
  data,
  currentUser,
  onChanged,
  onToast,
  onAskNexus,
  onOpenSectionWorkspace,
}: {
  data: PlatformData;
  currentUser: CrmUser;
  onChanged: () => void;
  onToast: (message: string) => void;
  onAskNexus: () => void;
  onOpenSectionWorkspace: (
    destination:
      "learning" | "teaching" | "assessments" | "grades" | "schedule",
    sectionId: string,
  ) => void;
}) {
  return (
    <>
      <PageIntro
        title="Academics"
        description="Manage departments, programs, classes and enrollment."
      />
      <AcademicOperations
        data={data}
        currentUser={currentUser}
        onChanged={onChanged}
        onToast={onToast}
        onAskNexus={onAskNexus}
        onOpenSectionWorkspace={onOpenSectionWorkspace}
      />
    </>
  );
}
