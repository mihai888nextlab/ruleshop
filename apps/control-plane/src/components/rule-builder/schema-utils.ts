import {
  CUSTOM_ATTRIBUTE_PREFIX,
  OPERATORS_BY_TYPE,
  operatorLabel,
  type ComparisonOp,
  type Condition,
  type ContextSchema,
  type DecisionType,
  type FieldDef,
  type FieldType,
  isGroupCondition,
  isNotCondition,
} from "@ruleshop/engine";

/**
 * Helpers shared by the block editor.
 *
 * The editor derives everything it offers from the store's context schema: which
 * variables exist, which operators each accepts, and what a value input should
 * look like. Nothing about fields or operators is hardcoded here, so an
 * attribute an administrator adds shows up without touching this file.
 */

export interface FieldGroup {
  label: string;
  fields: FieldDef[];
}

const GROUP_LABELS: Record<string, string> = {
  customer: "Client",
  product: "Produs",
  cart: "Coș",
  order: "Comandă",
  store: "Magazin",
};

/** Groups the palette by path prefix, with custom attributes called out. */
export function groupFields(fields: FieldDef[]): FieldGroup[] {
  const custom = fields.filter((f) => f.source === "custom");
  const builtin = fields.filter((f) => f.source === "builtin");

  const byPrefix = new Map<string, FieldDef[]>();
  for (const field of builtin) {
    const prefix = field.path.split(".")[0] ?? "other";
    const bucket = byPrefix.get(prefix);
    if (bucket) bucket.push(field);
    else byPrefix.set(prefix, [field]);
  }

  const groups: FieldGroup[] = [];

  // Store-defined fields first: they are the reason this store's rules differ
  // from any other's, so they should be the easiest to reach.
  if (custom.length > 0) {
    groups.push({ label: "Atribute definite de magazin", fields: custom });
  }

  for (const [prefix, group] of byPrefix) {
    groups.push({ label: GROUP_LABELS[prefix] ?? prefix, fields: group });
  }

  return groups;
}

export function isCustomField(field: FieldDef): boolean {
  return field.path.startsWith(CUSTOM_ATTRIBUTE_PREFIX);
}

export function operatorOptions(
  type: FieldType,
): { value: ComparisonOp; label: string }[] {
  return OPERATORS_BY_TYPE[type].map((op) => ({
    value: op,
    label: operatorLabel(type, op),
  }));
}

/**
 * A value that satisfies the field's type, used when a field or operator
 * changes. Producing a valid default rather than clearing the input keeps the
 * rule continuously valid while it is being edited.
 */
export function defaultValueFor(
  field: FieldDef | undefined,
  op: ComparisonOp,
): unknown {
  if (op === "exists") return undefined;
  if (op === "contains") return "";

  if (!field) return "";

  if (op === "in") {
    switch (field.type) {
      case "number":
        return [0];
      case "enum":
        return field.options?.length ? [field.options[0]] : [];
      case "date":
        return [todayIso()];
      default:
        return [""];
    }
  }

  switch (field.type) {
    case "number":
      return 0;
    case "boolean":
      return true;
    case "enum":
      return field.options?.[0] ?? "";
    case "date":
      return todayIso();
    case "string":
      return "";
  }
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** First operator still valid after a field's type changes. */
export function coerceOperator(
  type: FieldType,
  current: ComparisonOp,
): ComparisonOp {
  const allowed = OPERATORS_BY_TYPE[type];
  return allowed.includes(current) ? current : (allowed[0] as ComparisonOp);
}

export function fieldsInScope(
  schema: ContextSchema,
  decisionType: DecisionType,
): FieldDef[] {
  return schema.fields.filter(
    (f) => !f.availableIn || f.availableIn.includes(decisionType),
  );
}

// ---------------------------------------------------------------------------
// Tree addressing
// ---------------------------------------------------------------------------

/**
 * Blocks are addressed by their index path from the root, e.g. [0, 2] meaning
 * "third child of the first child". Immutable updates keyed on a path avoid
 * giving every block an id and keep the edited value exactly the shape the
 * engine stores.
 */
export type BlockPath = number[];

export function pathKey(path: BlockPath): string {
  return path.length === 0 ? "root" : path.join("-");
}

export function getAt(root: Condition, path: BlockPath): Condition | undefined {
  let current: Condition | undefined = root;
  for (const index of path) {
    if (!current) return undefined;
    if (isGroupCondition(current)) {
      current = current.children[index];
    } else if (isNotCondition(current)) {
      current = index === 0 ? current.child : undefined;
    } else {
      return undefined;
    }
  }
  return current;
}

/** Returns a new tree with the node at `path` replaced by `next`. */
export function replaceAt(
  root: Condition,
  path: BlockPath,
  next: Condition,
): Condition {
  if (path.length === 0) return next;

  const [index, ...rest] = path as [number, ...number[]];

  if (isGroupCondition(root)) {
    const children = [...root.children];
    const child = children[index];
    if (!child) return root;
    children[index] = replaceAt(child, rest, next);
    return { ...root, children };
  }

  if (isNotCondition(root) && index === 0) {
    return { ...root, child: replaceAt(root.child, rest, next) };
  }

  return root;
}

/** Returns a new tree with the node at `path` removed. */
export function removeAt(root: Condition, path: BlockPath): Condition {
  if (path.length === 0) return root;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = getAt(root, parentPath);
  if (!parent) return root;

  if (isGroupCondition(parent)) {
    const children = parent.children.filter((_, i) => i !== index);
    return replaceAt(root, parentPath, { ...parent, children });
  }

  // Removing the single child of a NOT removes the NOT with it, since a NOT
  // without a child is not a representable condition.
  if (isNotCondition(parent)) {
    return removeAt(root, parentPath);
  }

  return root;
}

/** Appends a child to the group at `path`. */
export function appendChild(
  root: Condition,
  path: BlockPath,
  child: Condition,
): Condition {
  const target = getAt(root, path);
  if (!target || !isGroupCondition(target)) return root;
  return replaceAt(root, path, {
    ...target,
    children: [...target.children, child],
  });
}

/** Moves a child within its group. */
export function moveChild(
  root: Condition,
  parentPath: BlockPath,
  from: number,
  to: number,
): Condition {
  const parent = getAt(root, parentPath);
  if (!parent || !isGroupCondition(parent)) return root;
  if (to < 0 || to >= parent.children.length) return root;

  const children = [...parent.children];
  const [moved] = children.splice(from, 1);
  if (!moved) return root;
  children.splice(to, 0, moved);
  return replaceAt(root, parentPath, { ...parent, children });
}

/**
 * Moves the block at `from` into the group at `toGroup`.
 *
 * Refuses to move a group into its own descendant, which would detach the tree.
 * Removal happens before insertion, and the target path is rebased if the
 * removal shifted it.
 */
export function moveInto(
  root: Condition,
  from: BlockPath,
  toGroup: BlockPath,
): Condition {
  if (from.length === 0) return root;
  if (isPrefix(from, toGroup)) return root;

  const moving = getAt(root, from);
  if (!moving) return root;

  const target = getAt(root, toGroup);
  if (!target || !isGroupCondition(target)) return root;

  const without = removeAt(root, from);
  const rebased = rebaseAfterRemoval(toGroup, from);

  return appendChild(without, rebased, moving);
}

/** Is `maybePrefix` an ancestor-or-self path of `path`? */
export function isPrefix(maybePrefix: BlockPath, path: BlockPath): boolean {
  if (maybePrefix.length > path.length) return false;
  return maybePrefix.every((segment, i) => segment === path[i]);
}

/**
 * Adjusts a path for the removal of `removed`.
 *
 * Only siblings before the target at the shared depth shift it, so this
 * decrements a single segment at most.
 */
function rebaseAfterRemoval(path: BlockPath, removed: BlockPath): BlockPath {
  const depth = removed.length - 1;
  if (path.length <= depth) return path;

  const sharedAncestor = removed
    .slice(0, depth)
    .every((segment, i) => segment === path[i]);
  if (!sharedAncestor) return path;

  const removedIndex = removed[depth]!;
  const pathIndex = path[depth]!;
  if (pathIndex > removedIndex) {
    const next = [...path];
    next[depth] = pathIndex - 1;
    return next;
  }
  return path;
}

// ---------------------------------------------------------------------------
// Mapping validation errors back onto blocks
// ---------------------------------------------------------------------------

/**
 * Converts a validation error's reported location into a block path.
 *
 * The engine reports positions like `conditions.and[0].or[1]`, where a bracketed
 * index selects a group child, and `.not` selects a negation's single child —
 * which the editor addresses as index 0.
 */
export function parseErrorPath(where: string): BlockPath {
  const path: BlockPath = [];
  const pattern = /\[(\d+)\]|\.not\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(where)) !== null) {
    path.push(match[1] === undefined ? 0 : Number(match[1]));
  }
  return path;
}

export interface ClassifiedErrors {
  /** Condition errors keyed by block path, for inline display. */
  byPath: Map<string, string[]>;
  actionErrors: string[];
  generalErrors: string[];
}

/**
 * Splits a flat error list into the three places the editor shows them: on a
 * specific block, on the action list, or at the top for rule metadata.
 */
export function classifyErrors(errors: string[]): ClassifiedErrors {
  const byPath = new Map<string, string[]>();
  const actionErrors: string[] = [];
  const generalErrors: string[] = [];

  for (const error of errors) {
    const separator = error.indexOf(":");
    const location = separator === -1 ? "" : error.slice(0, separator);
    const message =
      separator === -1 ? error : error.slice(separator + 1).trim() || error;

    if (location.startsWith("conditions")) {
      const key = pathKey(parseErrorPath(location));
      const bucket = byPath.get(key);
      if (bucket) bucket.push(message);
      else byPath.set(key, [message]);
    } else if (location.startsWith("actions")) {
      actionErrors.push(error);
    } else {
      generalErrors.push(error);
    }
  }

  return { byPath, actionErrors, generalErrors };
}

/** Human summary of a subtree, for collapsed blocks and drag overlays. */
export function describeCondition(
  cond: Condition,
  schema: ContextSchema,
): string {
  if (isGroupCondition(cond)) {
    const word = cond.op === "and" ? "ȘI" : "SAU";
    return `grup ${word} (${cond.children.length})`;
  }
  if (isNotCondition(cond)) {
    return `NU (${describeCondition(cond.child, schema)})`;
  }

  const field = schema.fields.find((f) => f.path === cond.path);
  const label = field?.label ?? cond.path;
  const op = field ? operatorLabel(field.type, cond.op) : cond.op;
  if (cond.op === "exists") return `${label} ${op}`;
  return `${label} ${op} ${formatValue(cond.value)}`;
}

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "da" : "nu";
  if (value === undefined || value === null) return "—";
  return String(value);
}
