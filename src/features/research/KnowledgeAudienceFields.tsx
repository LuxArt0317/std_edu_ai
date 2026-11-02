import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { CheckboxField } from "@/components/form-controls";
const roles = [
  "owner",
  "admin",
  "president",
  "vice_president",
  "dean",
  "registrar",
  "department_head",
  "faculty",
  "advisor",
  "admissions",
  "finance",
  "support",
  "librarian",
  "student",
];
export function KnowledgeAudienceFields({
  initialScope = "public",
  initialRoles = [],
  initialSection = "",
  sections,
}: {
  initialScope?: string;
  initialRoles?: string[];
  initialSection?: string;
  sections: { id: string; label: string }[];
}) {
  const [scope, setScope] = useState(initialScope);
  return (
    <div className="wide space-y-3">
      <Label>
        Who can read this?
        <NativeSelect
          name="audienceScope"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <NativeSelectOption value="public">
            Everyone (public)
          </NativeSelectOption>
          <NativeSelectOption value="institution">
            Signed-in users
          </NativeSelectOption>
          <NativeSelectOption value="staff">Staff only</NativeSelectOption>
          <NativeSelectOption value="role">Selected roles</NativeSelectOption>
          <NativeSelectOption value="class">Selected class</NativeSelectOption>
        </NativeSelect>
      </Label>
      {scope === "role" ? (
        <fieldset className="grid grid-cols-2 gap-2 rounded-lg border p-3">
          <legend className="px-1 text-sm">Allowed roles</legend>
          {roles.map((role) => (
            <Label key={role} className="flex items-center gap-2">
              <CheckboxField
                name="audienceRoles"
                value={role}
                aria-label={role.replaceAll("_", " ")}
                defaultChecked={initialRoles.includes(role)}
              />
              {role.replaceAll("_", " ")}
            </Label>
          ))}
        </fieldset>
      ) : null}
      {scope === "class" ? (
        <Label>
          Class
          <NativeSelect name="sectionId" defaultValue={initialSection} required>
            <NativeSelectOption value="">Choose a class</NativeSelectOption>
            {sections.map((section) => (
              <NativeSelectOption key={section.id} value={section.id}>
                {section.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
      ) : null}
    </div>
  );
}
