import { createContext, useContext } from 'react';

export const DepartmentReadOnlyContext = createContext(false);

export function useDepartmentReadOnly() {
  return useContext(DepartmentReadOnlyContext);
}
