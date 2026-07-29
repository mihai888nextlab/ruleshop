"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  isGroupCondition,
  isNotCondition,
  operatorLabel,
  type ComparisonOp,
  type Condition,
  type ContextSchema,
  type FieldDef,
} from "@ruleshop/engine";
import {
  appendChild,
  coerceOperator,
  defaultValueFor,
  describeCondition,
  getAt,
  groupFields,
  moveChild,
  moveInto,
  pathKey,
  removeAt,
  replaceAt,
  operatorOptions,
  type BlockPath,
} from "./schema-utils";
import { ValueInput } from "./value-input";

/**
 * Nested block editor for a condition tree.
 *
 * Blocks nest visually the way the AST nests, so the shape on screen is the
 * shape that gets stored — there is no separate editor model to drift out of
 * sync with what the engine evaluates.
 *
 * Composition works three ways deliberately: drag from the palette, drag
 * existing blocks between groups, and per-block buttons. The buttons are not a
 * fallback for a broken drag implementation; they are the keyboard-and-
 * screen-reader path, which drag alone cannot provide.
 */

const PALETTE_PREFIX = "field:";
const BLOCK_PREFIX = "block:";
const DROP_PREFIX = "drop:";

export function ConditionTree({
  value,
  onChange,
  schema,
  fieldsInScope,
  errorsByPath,
}: {
  value: Condition;
  onChange: (next: Condition) => void;
  schema: ContextSchema;
  fieldsInScope: FieldDef[];
  errorsByPath: Map<string, string[]>;
}) {
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const sensors = useSensors(
    // A small distance threshold keeps clicks on selects and inputs inside a
    // block from being swallowed as drag starts.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith(PALETTE_PREFIX)) {
      const path = id.slice(PALETTE_PREFIX.length);
      const field = fieldsInScope.find((f) => f.path === path);
      setDragLabel(field?.label ?? path);
      return;
    }
    if (id.startsWith(BLOCK_PREFIX)) {
      const blockPath = parsePath(id.slice(BLOCK_PREFIX.length));
      const node = getAt(value, blockPath);
      setDragLabel(node ? describeCondition(node, schema) : null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragLabel(null);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || !overId.startsWith(DROP_PREFIX)) return;

    const targetPath = parsePath(overId.slice(DROP_PREFIX.length));
    const activeId = String(event.active.id);

    if (activeId.startsWith(PALETTE_PREFIX)) {
      const fieldPath = activeId.slice(PALETTE_PREFIX.length);
      const field = fieldsInScope.find((f) => f.path === fieldPath);
      if (!field) return;
      onChange(appendChild(value, targetPath, newComparison(field)));
      return;
    }

    if (activeId.startsWith(BLOCK_PREFIX)) {
      const fromPath = parsePath(activeId.slice(BLOCK_PREFIX.length));
      onChange(moveInto(value, fromPath, targetPath));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragLabel(null)}
    >
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Palette fields={fieldsInScope} />

        <div className="rounded-lg bg-[#12161f] p-3 ring-1 ring-white/10">
          <ConditionNode
            node={value}
            path={[]}
            root={value}
            onChange={onChange}
            schema={schema}
            fieldsInScope={fieldsInScope}
            errorsByPath={errorsByPath}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragLabel && (
          <div className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-lg">
            {dragLabel}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function parsePath(raw: string): BlockPath {
  if (raw === "root" || raw === "") return [];
  return raw.split("-").map((n) => Number(n));
}

function newComparison(field: FieldDef): Condition {
  const op = coerceOperator(field.type, "eq");
  const value = defaultValueFor(field, op);
  return value === undefined
    ? { op, path: field.path }
    : { op, path: field.path, value };
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

function Palette({ fields }: { fields: FieldDef[] }) {
  const groups = groupFields(fields);

  return (
    <aside className="flex flex-col gap-3 rounded-lg bg-[#12161f] p-3 ring-1 ring-white/10">
      <p className="text-xs font-medium uppercase tracking-wide text-white/40">
        Variabile
      </p>
      <p className="text-xs text-white/40">
        Trage o variabilă într-un grup, sau folosește „+ condiție”.
      </p>

      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-white/60">{group.label}</p>
          {group.fields.map((field) => (
            <PaletteItem key={field.path} field={field} />
          ))}
        </div>
      ))}

      {fields.length === 0 && (
        <p className="text-xs text-amber-300/80">
          Nicio variabilă disponibilă pentru acest tip de decizie.
        </p>
      )}
    </aside>
  );
}

function PaletteItem({ field }: { field: FieldDef }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggableBlock(
    `${PALETTE_PREFIX}${field.path}`,
  );

  const custom = field.source === "custom";

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={`${field.path} · ${field.type}`}
      className={
        "cursor-grab rounded border px-2 py-1 text-left text-xs transition " +
        (custom
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100 hover:border-emerald-300/70"
          : "border-white/15 bg-white/5 text-white/80 hover:border-white/35") +
        (isDragging ? " opacity-40" : "")
      }
    >
      <span className="block truncate">{field.label}</span>
      <span className="block truncate text-[10px] text-white/35">
        {field.type}
      </span>
    </button>
  );
}

/** Thin wrapper so blocks and palette items share one drag setup. */
function useDraggableBlock(id: string) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return { attributes, listeners, setNodeRef, isDragging };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function ConditionNode(props: {
  node: Condition;
  path: BlockPath;
  root: Condition;
  onChange: (next: Condition) => void;
  schema: ContextSchema;
  fieldsInScope: FieldDef[];
  errorsByPath: Map<string, string[]>;
}) {
  const { node } = props;
  if (isGroupCondition(node)) return <GroupBlock {...props} node={node} />;
  if (isNotCondition(node)) return <NotBlock {...props} node={node} />;
  return <ComparisonBlock {...props} node={node} />;
}

function BlockControls({
  path,
  root,
  onChange,
  canWrap = true,
}: {
  path: BlockPath;
  root: Condition;
  onChange: (next: Condition) => void;
  canWrap?: boolean;
}) {
  const isRoot = path.length === 0;
  if (isRoot) return null;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = getAt(root, parentPath);
  const siblingCount = parent && isGroupCondition(parent) ? parent.children.length : 1;
  const node = getAt(root, path);

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {siblingCount > 1 && (
        <>
          <IconButton
            label="Mută mai sus"
            disabled={index === 0}
            onClick={() => onChange(moveChild(root, parentPath, index, index - 1))}
          >
            ↑
          </IconButton>
          <IconButton
            label="Mută mai jos"
            disabled={index === siblingCount - 1}
            onClick={() => onChange(moveChild(root, parentPath, index, index + 1))}
          >
            ↓
          </IconButton>
        </>
      )}
      {canWrap && node && (
        <IconButton
          label="Încadrează în NU"
          onClick={() => onChange(replaceAt(root, path, { op: "not", child: node }))}
        >
          NU
        </IconButton>
      )}
      <IconButton label="Șterge blocul" onClick={() => onChange(removeAt(root, path))}>
        ×
      </IconButton>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded px-1.5 py-0.5 text-xs text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function GroupBlock({
  node,
  path,
  root,
  onChange,
  schema,
  fieldsInScope,
  errorsByPath,
}: {
  node: Extract<Condition, { children: Condition[] }>;
  path: BlockPath;
  root: Condition;
  onChange: (next: Condition) => void;
  schema: ContextSchema;
  fieldsInScope: FieldDef[];
  errorsByPath: Map<string, string[]>;
}) {
  const key = pathKey(path);
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${DROP_PREFIX}${key}`,
  });
  const drag = useDraggableBlock(`${BLOCK_PREFIX}${key}`);
  const errors = errorsByPath.get(key) ?? [];

  const isAnd = node.op === "and";
  const accent = isAnd
    ? "border-indigo-400/50 bg-indigo-500/10"
    : "border-amber-400/50 bg-amber-500/10";
  const chip = isAnd
    ? "bg-indigo-400/25 text-indigo-100"
    : "bg-amber-400/25 text-amber-100";

  const firstField = fieldsInScope[0];

  return (
    <div
      ref={setDropRef}
      className={
        "rounded-lg border-2 p-2 transition " +
        accent +
        (isOver ? " ring-2 ring-white/50" : "")
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {path.length > 0 && (
          <span
            ref={drag.setNodeRef}
            {...drag.listeners}
            {...drag.attributes}
            className="cursor-grab select-none px-1 text-white/35"
            aria-label="Trage grupul"
            role="button"
            tabIndex={0}
          >
            ⠿
          </span>
        )}

        {/* Toggling the connector rewrites the whole group's logic, so it reads
            as a switch rather than a label. */}
        <button
          type="button"
          onClick={() =>
            onChange(replaceAt(root, path, { ...node, op: isAnd ? "or" : "and" }))
          }
          className={`rounded px-2 py-0.5 text-xs font-semibold ${chip}`}
          title="Comută între ȘI / SAU"
        >
          {isAnd ? "ȘI" : "SAU"}
        </button>

        <span className="text-xs text-white/40">
          {isAnd
            ? "toate condițiile trebuie îndeplinite"
            : "cel puțin o condiție"}
        </span>

        <BlockControls path={path} root={root} onChange={onChange} />
      </div>

      {errors.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {errors.map((error, i) => (
            <li key={i} className="text-xs text-rose-300">
              {error}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-col gap-2 pl-3">
        {node.children.map((child, index) => (
          <ConditionNode
            key={index}
            node={child}
            path={[...path, index]}
            root={root}
            onChange={onChange}
            schema={schema}
            fieldsInScope={fieldsInScope}
            errorsByPath={errorsByPath}
          />
        ))}

        {node.children.length === 0 && (
          <p className="rounded border border-dashed border-white/20 px-2 py-3 text-center text-xs text-white/35">
            Trage o variabilă aici
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <AddButton
            disabled={!firstField}
            onClick={() =>
              firstField &&
              onChange(appendChild(root, path, newComparison(firstField)))
            }
          >
            + condiție
          </AddButton>
          <AddButton
            onClick={() =>
              onChange(appendChild(root, path, { op: "and", children: [] }))
            }
          >
            + grup
          </AddButton>
          <AddButton
            disabled={!firstField}
            onClick={() =>
              firstField &&
              onChange(
                appendChild(root, path, {
                  op: "not",
                  child: newComparison(firstField),
                }),
              )
            }
          >
            + NU
          </AddButton>
        </div>
      </div>
    </div>
  );
}

function AddButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-white/20 bg-white/5 px-2 py-0.5 text-xs text-white/70 transition hover:border-white/40 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function NotBlock({
  node,
  path,
  root,
  onChange,
  schema,
  fieldsInScope,
  errorsByPath,
}: {
  node: Extract<Condition, { child: Condition }>;
  path: BlockPath;
  root: Condition;
  onChange: (next: Condition) => void;
  schema: ContextSchema;
  fieldsInScope: FieldDef[];
  errorsByPath: Map<string, string[]>;
}) {
  const key = pathKey(path);
  const drag = useDraggableBlock(`${BLOCK_PREFIX}${key}`);

  return (
    <div className="rounded-lg border-2 border-rose-400/50 bg-rose-500/10 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className="cursor-grab select-none px-1 text-white/35"
          aria-label="Trage blocul"
          role="button"
          tabIndex={0}
        >
          ⠿
        </span>
        <span className="rounded bg-rose-400/25 px-2 py-0.5 text-xs font-semibold text-rose-100">
          NU
        </span>
        <span className="text-xs text-white/40">condiția de mai jos e falsă</span>

        {/* Unwrapping is offered here instead of the generic "wrap in NOT",
            since wrapping a NOT in another NOT is never what an author wants. */}
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label="Elimină negația"
            onClick={() => onChange(replaceAt(root, path, node.child))}
          >
            ⤴
          </IconButton>
          <BlockControls
            path={path}
            root={root}
            onChange={onChange}
            canWrap={false}
          />
        </div>
      </div>

      <div className="mt-2 pl-3">
        <ConditionNode
          node={node.child}
          path={[...path, 0]}
          root={root}
          onChange={onChange}
          schema={schema}
          fieldsInScope={fieldsInScope}
          errorsByPath={errorsByPath}
        />
      </div>
    </div>
  );
}

function ComparisonBlock({
  node,
  path,
  root,
  onChange,
  fieldsInScope,
  errorsByPath,
}: {
  node: Extract<Condition, { path: string }>;
  path: BlockPath;
  root: Condition;
  onChange: (next: Condition) => void;
  schema: ContextSchema;
  fieldsInScope: FieldDef[];
  errorsByPath: Map<string, string[]>;
}) {
  const key = pathKey(path);
  const drag = useDraggableBlock(`${BLOCK_PREFIX}${key}`);
  const errors = errorsByPath.get(key) ?? [];

  const field = fieldsInScope.find((f) => f.path === node.path);
  const custom = field?.source === "custom";
  const unknown = !field;

  const border = unknown
    ? "border-rose-400/60 bg-rose-500/10"
    : custom
      ? "border-emerald-400/50 bg-emerald-500/10"
      : "border-sky-400/40 bg-sky-500/10";

  function update(next: Partial<Extract<Condition, { path: string }>>) {
    onChange(replaceAt(root, path, { ...node, ...next } as Condition));
  }

  function changeField(nextPath: string) {
    const nextField = fieldsInScope.find((f) => f.path === nextPath);
    if (!nextField) return;
    // Both the operator and the value may be invalid for the new type, so they
    // are re-derived rather than carried across.
    const op = coerceOperator(nextField.type, node.op);
    const value = defaultValueFor(nextField, op);
    onChange(
      replaceAt(
        root,
        path,
        value === undefined
          ? { op, path: nextPath }
          : { op, path: nextPath, value },
      ),
    );
  }

  function changeOperator(op: ComparisonOp) {
    const value = defaultValueFor(field, op);
    onChange(
      replaceAt(
        root,
        path,
        value === undefined
          ? { op, path: node.path }
          : { op, path: node.path, value },
      ),
    );
  }

  const selectClass =
    "rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:border-white/40";

  return (
    <div className={"rounded-lg border-2 p-2 " + border}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className="cursor-grab select-none px-1 text-white/35"
          aria-label="Trage condiția"
          role="button"
          tabIndex={0}
        >
          ⠿
        </span>

        <select
          aria-label="Variabilă"
          className={selectClass}
          value={node.path}
          onChange={(e) => changeField(e.target.value)}
        >
          {unknown && (
            <option value={node.path}>{node.path} (indisponibil)</option>
          )}
          {groupFields(fieldsInScope).map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.fields.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          aria-label="Operator"
          className={selectClass}
          value={node.op}
          onChange={(e) => changeOperator(e.target.value as ComparisonOp)}
        >
          {field ? (
            operatorOptions(field.type).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          ) : (
            <option value={node.op}>{node.op}</option>
          )}
        </select>

        <ValueInput
          field={field}
          op={node.op}
          value={node.value}
          onChange={(value) =>
            value === undefined
              ? onChange(replaceAt(root, path, { op: node.op, path: node.path }))
              : update({ value })
          }
        />

        <BlockControls path={path} root={root} onChange={onChange} />
      </div>

      {field?.type && (
        <p className="mt-1 pl-6 text-[10px] text-white/30">
          {field.path} · {field.type}
          {field.description ? ` · ${field.description}` : ""}
        </p>
      )}

      {errors.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 pl-6">
          {errors.map((error, i) => (
            <li key={i} className="text-xs text-rose-300">
              {error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
