export enum FieldType {
  Woods = "Woods",
  Ocean = "Ocean",
  Mountain = "Mountain",
  Farmland = "Farmland",
  Hills = "Hills",
  City = "City",
  Industry = "Industry",
}

export type Territory = "land" | "water" | "all";

export interface FieldTypeDef {
  id: FieldType;
  territory: Territory;
  movementCost: number; // 1..n
  defense: number;      // 0..100 (like your C++)
  tileImageKey: string; // used by renderer to load image
}

export const FIELD_TYPES: Record<FieldType, FieldTypeDef> = {
  [FieldType.Woods]: {
    id: FieldType.Woods,
    territory: "land",
    movementCost: 2,
    defense: 35,
    tileImageKey: "woods",
  },
  [FieldType.Ocean]: {
    id: FieldType.Ocean,
    territory: "water",
    movementCost: 1,
    defense: 0,
    tileImageKey: "ocean",
  },
  [FieldType.Mountain]: {
    id: FieldType.Mountain,
    territory: "land",
    movementCost: 3,
    defense: 50,
    tileImageKey: "mountain",
  },
  [FieldType.Farmland]: {
    id: FieldType.Farmland,
    territory: "land",
    movementCost: 1,
    defense: 15,
    tileImageKey: "farmland",
  },
  [FieldType.Hills]: {
    id: FieldType.Hills,
    territory: "land",
    movementCost: 2,
    defense: 35,
    tileImageKey: "hills",
  },
  [FieldType.City]: {
    id: FieldType.City,
    territory: "land",
    movementCost: 1,
    defense: 40,
    tileImageKey: "city",
  },
  [FieldType.Industry]: {
    id: FieldType.Industry,
    territory: "land",
    movementCost: 1,
    defense: 40,
    tileImageKey: "industry",
  },
};

// Small helper for readability
export function getFieldDef(field: FieldType): FieldTypeDef {
  return FIELD_TYPES[field];
}
