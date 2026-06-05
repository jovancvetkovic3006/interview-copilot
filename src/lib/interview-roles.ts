import { isKnownPresetRole, PRESET_ROLES } from "@/data/role-config";

export const ROLE_LABEL_SEPARATOR = " + ";

export function formatInterviewRoleLabel(roles: string[]): string {
  return roles.filter(Boolean).join(ROLE_LABEL_SEPARATOR);
}

/** Resolve preset or custom role keys from config (backward compatible with single `role`). */
export function resolveInterviewRoles(config: { role: string; roles?: string[] }): string[] {
  if (config.roles?.length) {
    return config.roles;
  }
  const role = config.role?.trim();
  if (!role) {
    return [PRESET_ROLES[0]];
  }
  const parts = role.split(ROLE_LABEL_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every(isKnownPresetRole)) {
    return parts;
  }
  return [role];
}

export function isMultiRoleInterview(config: { role: string; roles?: string[] }): boolean {
  return resolveInterviewRoles(config).length > 1;
}
