export type Item = {
  label: string;
  department: string;
};

export type Department = {
  label: string;
};

export type ItemsByDepartment = {
  departmentName: string;
  items: Item[];
};
