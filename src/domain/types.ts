export type SavedTab = {
  id: string;
  title: string;
  url: string;
  favIconUrl?: string;
  kind: 'record';
};

export type Group = {
  id: string;
  name: string;
  tabs: SavedTab[];
};

export type Space = {
  id: string;
  name: string;
  groups: Group[];
  pins?: Record<string, unknown>;
};

export type Workspace = {
  version: number;
  spaceOrder: string[];
  spaces: Record<string, Space>;
};

export type TabTabBackup = {
  version: number;
  space_list: { id: string; name: string }[];
  spaces: Record<string, {
    id: string;
    name: string;
    groups: Group[];
    pins?: Record<string, unknown>;
  }>;
};
