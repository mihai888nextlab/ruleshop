import type { ComparisonOp, DecisionType } from "./types";

/**
 * The context schema: a typed catalogue of every fact a rule may reference.
 *
 * This is what makes "operators compatible with the evaluated data type" real
 * rather than decorative. Without it a rule could say
 * `{ op: "gt", path: "customer.tier", value: "vip" }` — greater-than on a
 * string — and the engine would silently evaluate it to false forever.
 *
 * The schema has two sources. Built-in fields are the facts the platform always
 * supplies. Custom fields come from attributes a store administrator defines,
 * which is why this lives in the engine rather than being hardcoded in the UI:
 * the same catalogue drives the editor palette, server-side validation, and the
 * operator list offered for each field.
 */

export type FieldType = "string" | "number" | "boolean" | "enum" | "date";

export interface FieldDef {
  /** Dotted path into the decision context, e.g. `customer.loyaltyPoints`. */
  path: string;
  label: string;
  type: FieldType;
  /** Allowed values, for `enum` fields. */
  options?: string[];
  description?: string;
  /**
   * Decision types where this fact is present. A pricing rule can read
   * `product.*`, a fraud rule cannot — the product is not in scope at checkout.
   * Undefined means available everywhere.
   */
  availableIn?: DecisionType[];
  source: "builtin" | "custom";
}

export interface ContextSchema {
  fields: FieldDef[];
}

/**
 * Which operators make sense for which type.
 *
 * `exists` is available everywhere because "was this fact supplied at all" is
 * meaningful regardless of type — it is how a rule distinguishes a guest with
 * no profile from a customer who left a field blank.
 */
export const OPERATORS_BY_TYPE: Record<FieldType, ComparisonOp[]> = {
  string: ["eq", "neq", "in", "contains", "exists"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "in", "exists"],
  // `in` is omitted for booleans: with only two values, membership adds nothing
  // that eq does not already express more clearly.
  boolean: ["eq", "neq", "exists"],
  enum: ["eq", "neq", "in", "exists"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte", "in", "exists"],
};

/**
 * Human labels for operators, which differ by type: `gt` reads as "greater
 * than" for a number but "after" for a date. The editor shows these.
 */
export const OPERATOR_LABELS: Record<
  FieldType,
  Partial<Record<ComparisonOp, string>>
> = {
  string: {
    eq: "este",
    neq: "nu este",
    in: "este una din",
    contains: "conține",
    exists: "are valoare",
  },
  number: {
    eq: "este egal cu",
    neq: "nu este egal cu",
    gt: "mai mare decât",
    gte: "mai mare sau egal cu",
    lt: "mai mic decât",
    lte: "mai mic sau egal cu",
    in: "este una din",
    exists: "are valoare",
  },
  boolean: { eq: "este", neq: "nu este", exists: "are valoare" },
  enum: {
    eq: "este",
    neq: "nu este",
    in: "este una din",
    exists: "are valoare",
  },
  date: {
    eq: "este în data de",
    neq: "nu este în data de",
    gt: "după",
    gte: "începând cu",
    lt: "înainte de",
    lte: "până la",
    in: "este una din",
    exists: "are valoare",
  },
};

export function operatorsForType(type: FieldType): ComparisonOp[] {
  return OPERATORS_BY_TYPE[type];
}

export function operatorLabel(type: FieldType, op: ComparisonOp): string {
  return OPERATOR_LABELS[type][op] ?? op;
}

export function typeName(type: FieldType): string {
  return {
    string: "text",
    number: "număr",
    boolean: "da/nu",
    enum: "listă",
    date: "dată",
  }[type];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Does a value fit a field's declared type?
 *
 * Shared deliberately between two callers: rule validation checks the literal
 * an author typed into a condition, and profile validation checks what a
 * customer submitted for the same attribute. One implementation means a value
 * accepted into a profile can never be one a rule is forbidden to compare
 * against.
 *
 * Returns a human-readable problem, or null when the value is acceptable.
 */
export function fieldValueError(field: FieldDef, value: unknown): string | null {
  switch (field.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : "așteaptă un număr";
    case "boolean":
      return typeof value === "boolean" ? null : "așteaptă adevărat sau fals";
    case "enum": {
      if (typeof value !== "string") return "așteaptă o valoare din listă";
      const options = field.options ?? [];
      return options.includes(value)
        ? null
        : `valoarea "${value}" nu este în lista permisă (${options.join(", ")})`;
    }
    case "date":
      if (typeof value !== "string" || !ISO_DATE.test(value)) {
        return "așteaptă o dată în format AAAA-LL-ZZ";
      }
      return Number.isNaN(Date.parse(value)) ? "dată invalidă" : null;
    case "string":
      return typeof value === "string" ? null : "așteaptă text";
  }
}

/** Path prefix under which administrator-defined attributes are exposed. */
export const CUSTOM_ATTRIBUTE_PREFIX = "customer.attributes.";

export function customAttributePath(key: string): string {
  return `${CUSTOM_ATTRIBUTE_PREFIX}${key}`;
}

/**
 * Facts the platform always provides.
 *
 * Nothing here is a business conclusion. `tier` is the one derived value and it
 * is a coarse convenience; rules that need a different segmentation should read
 * the underlying numbers or a store-defined attribute.
 */
export const BUILTIN_FIELDS: FieldDef[] = [
  {
    path: "store.slug",
    label: "Magazin",
    type: "string",
    source: "builtin",
    description: "Identificatorul magazinului evaluat.",
  },

  // Customer
  {
    path: "customer.isGuest",
    label: "Client neautentificat",
    type: "boolean",
    source: "builtin",
    description: "Adevărat pentru cumpărături în regim guest.",
  },
  {
    path: "customer.verified",
    label: "Cont confirmat",
    type: "boolean",
    source: "builtin",
  },
  {
    path: "customer.email",
    label: "Email client",
    type: "string",
    source: "builtin",
  },
  {
    path: "customer.tier",
    label: "Segment client",
    type: "enum",
    options: ["guest", "standard", "vip"],
    source: "builtin",
    description: "Derivat din punctele de loialitate.",
  },
  {
    path: "customer.loyaltyPoints",
    label: "Puncte de loialitate",
    type: "number",
    source: "builtin",
  },
  {
    path: "customer.orderCount",
    label: "Număr de comenzi",
    type: "number",
    source: "builtin",
    description: "Comenzi anterioare în acest magazin.",
  },
  {
    path: "customer.totalSpent",
    label: "Total cheltuit",
    type: "number",
    source: "builtin",
  },
  {
    path: "customer.avgOrderValue",
    label: "Valoare medie comandă",
    type: "number",
    source: "builtin",
  },
  {
    path: "customer.isFirstOrder",
    label: "Prima comandă",
    type: "boolean",
    source: "builtin",
  },

  // Product — only in scope where a specific product is being decided about
  {
    path: "product.slug",
    label: "Produs",
    type: "string",
    source: "builtin",
    availableIn: ["pricing", "availability"],
  },
  {
    path: "product.category",
    label: "Categorie produs",
    type: "string",
    source: "builtin",
    availableIn: ["pricing", "availability"],
  },
  {
    path: "product.basePrice",
    label: "Preț de bază",
    type: "number",
    source: "builtin",
    availableIn: ["pricing", "availability"],
  },
  {
    path: "product.stock",
    label: "Stoc",
    type: "number",
    source: "builtin",
    availableIn: ["pricing", "availability"],
  },
  {
    path: "product.inStock",
    label: "În stoc",
    type: "boolean",
    source: "builtin",
    availableIn: ["pricing", "availability"],
  },

  // Cart and order — in scope from the cart onwards
  {
    path: "cart.subtotal",
    label: "Subtotal coș",
    type: "number",
    source: "builtin",
    availableIn: ["shipping", "fraud", "loyalty", "pricing"],
  },
  {
    path: "cart.itemCount",
    label: "Număr articole",
    type: "number",
    source: "builtin",
    availableIn: ["shipping", "fraud", "loyalty", "pricing"],
  },
  {
    path: "order.total",
    label: "Total comandă",
    type: "number",
    source: "builtin",
    availableIn: ["fraud", "loyalty"],
  },
  {
    path: "order.itemCount",
    label: "Articole în comandă",
    type: "number",
    source: "builtin",
    availableIn: ["fraud", "loyalty"],
  },
];

/** Assemble the catalogue for a store from built-ins plus its own attributes. */
export function buildContextSchema(
  customFields: FieldDef[] = [],
): ContextSchema {
  return { fields: [...BUILTIN_FIELDS, ...customFields] };
}

export function findField(
  schema: ContextSchema,
  path: string,
): FieldDef | undefined {
  return schema.fields.find((f) => f.path === path);
}

/** Fields a rule of this decision type is allowed to read. */
export function fieldsForDecisionType(
  schema: ContextSchema,
  decisionType: DecisionType,
): FieldDef[] {
  return schema.fields.filter(
    (f) => !f.availableIn || f.availableIn.includes(decisionType),
  );
}
