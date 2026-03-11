import { createContext, useContext, useState, ReactNode } from "react";
import type { AppRole } from "@/hooks/useUserRole";

interface RolePreviewContextType {
  previewRole: AppRole | null;
  setPreviewRole: (role: AppRole | null) => void;
  isPreviewActive: boolean;
}

const RolePreviewContext = createContext<RolePreviewContextType>({
  previewRole: null,
  setPreviewRole: () => {},
  isPreviewActive: false,
});

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const [previewRole, setPreviewRole] = useState<AppRole | null>(null);

  return (
    <RolePreviewContext.Provider
      value={{
        previewRole,
        setPreviewRole,
        isPreviewActive: previewRole !== null,
      }}
    >
      {children}
    </RolePreviewContext.Provider>
  );
}

export function useRolePreview() {
  return useContext(RolePreviewContext);
}
