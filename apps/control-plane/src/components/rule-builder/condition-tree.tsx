"use client";

import { useState, type ReactNode } from "react";
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
 * Condition blocks for the Scratch-style board.
 *
 * Palette lives on the left; mouths nest inside the Dacă C-block on the right.
 */

export const PALETTE_PREFIX = "field:";
export const STRUCT_PREFIX = "struct:";
export const ACTION_PREFIX = "action:";
export const BLOCK_PREFIX = "block:";
export const DROP_PREFIX = "drop:";
export const DROP_THEN_ID = "drop:then";

type StructKind = "and" | "or" | "not";

export function ConditionDragRoot({
  value,
  onChange,
  schema,
  fieldsInScope,
  onAddAction,
  children,
}: {
  value: Condition;
  onChange: (next: Condition) => void;
  schema: ContextSchema;
  fieldsInScope: FieldDef[];
  onAddAction?: (actionType: string) => void;
  children: ReactNode;
}) {
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const sensors = useSensors(
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
    if (id.startsWith(STRUCT_PREFIX)) {
      const kind = id.slice(STRUCT_PREFIX.length) as StructKind;
      setDragLabel(
        kind === "and"
          ? "Grup ȘI (toate)"
          : kind === "or"
            ? "Grup SAU (oricare)"
            : "NU",
      );
      return;
    }
    if (id.startsWith(ACTION_PREFIX)) {
      setDragLabel(String(event.active.data.current?.label ?? "Acțiune"));
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
    if (!overId) return;

    const activeId = String(event.active.id);

    if (overId === DROP_THEN_ID && activeId.startsWith(ACTION_PREFIX)) {
      onAddAction?.(activeId.slice(ACTION_PREFIX.length));
      return;
    }

    if (!overId.startsWith(DROP_PREFIX) || overId === DROP_THEN_ID) return;

    const targetPath = parsePath(overId.slice(DROP_PREFIX.length));

    if (activeId.startsWith(PALETTE_PREFIX)) {
      const fieldPath = activeId.slice(PALETTE_PREFIX.length);
      const field = fieldsInScope.find((f) => f.path === fieldPath);
      if (!field) return;
      onChange(appendChild(value, targetPath, newComparison(field)));
      return;
    }

    if (activeId.startsWith(STRUCT_PREFIX)) {
      const kind = activeId.slice(STRUCT_PREFIX.length) as StructKind;
      const firstField = fieldsInScope[0];
      if (kind === "not") {
        if (!firstField) return;
        onChange(
          appendChild(value, targetPath, {
            op: "not",
            child: newComparison(firstField),
          }),
        );
        return;
      }
      onChange(appendChild(value, targetPath, { op: kind, children: [] }));
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
      {children}
      <DragOverlay dropAnimation={null}>
        {dragLabel && <div className="rb-overlay">{dragLabel}</div>}
      </DragOverlay>
    </DndContext>
  );
}

export function ConditionPalette({ fields }: { fields: FieldDef[] }) {
  const groups = groupFields(fields);

  return (
    <div className="rb-palette-section">
      <p className="rb-palette-label">Logică</p>
      <StructItem kind="and" label="ȘI · toate" />
      <StructItem kind="or" label="SAU · oricare" />
      <StructItem kind="not" label="NU" disabled={fields.length === 0} />

      {groups.map((group) => (
        <div key={group.label} className="rb-palette-group">
          <p className="rb-palette-label">{group.label}</p>
          {group.fields.map((field) => (
            <PaletteItem key={field.path} field={field} />
          ))}
        </div>
      ))}

      {fields.length === 0 && (
        <p className="text-xs text-[var(--warn)]">
          Nicio variabilă pentru acest tip de decizie.
        </p>
      )}
    </div>
  );
}

export function ConditionMouth({
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
  if (isGroupCondition(value)) {
    return (
      <RootMouth
        node={value}
        root={value}
        onChange={onChange}
        schema={schema}
        fieldsInScope={fieldsInScope}
        errorsByPath={errorsByPath}
      />
    );
  }

  return (
    <ConditionNode
      node={value}
      path={[]}
      root={value}
      onChange={onChange}
      schema={schema}
      fieldsInScope={fieldsInScope}
      errorsByPath={errorsByPath}
    />
  );
}

export function RootLogicToggle({
  value,
  onChange,
}: {
  value: Condition;
  onChange: (next: Condition) => void;
}) {
  if (!isGroupCondition(value)) return null;
  const isAnd = value.op === "and";
  return (
    <button
      type="button"
      onClick={() => onChange({ ...value, op: isAnd ? "or" : "and" })}
      className={`rb-chip ${isAnd ? "rb-chip--and" : "rb-chip--or"}`}
      title="Comută între toate (ȘI) / oricare (SAU)"
    >
      {isAnd ? "toate · ȘI" : "oricare · SAU"}
    </button>
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

function StructItem({
  kind,
  label,
  disabled,
}: {
  kind: StructKind;
  label: string;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${STRUCT_PREFIX}${kind}`,
    disabled,
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      disabled={disabled}
      data-dragging={isDragging || undefined}
      className={`rb-brick rb-brick--logic-${kind}`}
    >
      {label}
    </button>
  );
}

function PaletteItem({ field }: { field: FieldDef }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_PREFIX}${field.path}`,
  });

  const custom = field.source === "custom";

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={`${field.path} · ${field.type}`}
      data-dragging={isDragging || undefined}
      className={`rb-brick ${custom ? "rb-brick--custom" : "rb-brick--field"}`}
    >
      <span className="block truncate">{field.label}</span>
      <span className="rb-brick-sub truncate">{field.type}</span>
    </button>
  );
}

function RootMouth({
  node,
  root,
  onChange,
  schema,
  fieldsInScope,
  errorsByPath,
}: {
  node: Extract<Condition, { children: Condition[] }>;
  root: Condition;
  onChange: (next: Condition) => void;
  schema: ContextSchema;
  fieldsInScope: FieldDef[];
  errorsByPath: Map<string, string[]>;
}) {
  const path: BlockPath = [];
  const key = pathKey(path);
  const { setNodeRef, isOver } = useDroppable({ id: `${DROP_PREFIX}${key}` });
  const errors = errorsByPath.get(key) ?? [];
  const firstField = fieldsInScope[0];

  return (
    <div
      ref={setNodeRef}
      data-over={isOver || undefined}
      className="rb-mouth rb-mouth--root"
    >
      {errors.length > 0 && (
        <ul className="rb-block-errors" style={{ paddingLeft: 0 }}>
          {errors.map((error, i) => (
            <li key={i} className="rb-block-error">
              {error}
            </li>
          ))}
        </ul>
      )}

      {node.children.map((child, index) => (
        <ConditionNode
          key={index}
          node={child}
          path={[index]}
          root={root}
          onChange={onChange}
          schema={schema}
          fieldsInScope={fieldsInScope}
          errorsByPath={errorsByPath}
        />
      ))}

      {node.children.length === 0 && (
        <p className="rb-slot" data-over={isOver || undefined}>
          Trage condiții sau logică aici
        </p>
      )}

      <div className="rb-add-row">
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
          + grup ȘI
        </AddButton>
        <AddButton
          onClick={() =>
            onChange(appendChild(root, path, { op: "or", children: [] }))
          }
        >
          + grup SAU
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
  );
}

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
  leading,
}: {
  path: BlockPath;
  root: Condition;
  onChange: (next: Condition) => void;
  canWrap?: boolean;
  leading?: ReactNode;
}) {
  const isRoot = path.length === 0;
  if (isRoot && !leading) return null;

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1]!;
  const parent = getAt(root, parentPath);
  const siblingCount =
    parent && isGroupCondition(parent) ? parent.children.length : 1;
  const node = getAt(root, path);

  return (
    <div className="rb-controls">
      {leading}
      {!isRoot && siblingCount > 1 && (
        <>
          <IconButton
            label="Mută mai sus"
            disabled={index === 0}
            onClick={() =>
              onChange(moveChild(root, parentPath, index, index - 1))
            }
          >
            ↑
          </IconButton>
          <IconButton
            label="Mută mai jos"
            disabled={index === siblingCount - 1}
            onClick={() =>
              onChange(moveChild(root, parentPath, index, index + 1))
            }
          >
            ↓
          </IconButton>
        </>
      )}
      {!isRoot && canWrap && node && (
        <IconButton
          label="Încadrează în NU"
          onClick={() =>
            onChange(replaceAt(root, path, { op: "not", child: node }))
          }
        >
          NU
        </IconButton>
      )}
      {!isRoot && (
        <IconButton
          label="Șterge blocul"
          onClick={() => onChange(removeAt(root, path))}
        >
          ×
        </IconButton>
      )}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode;
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
      className="rb-icon-btn"
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
  const drag = useDraggable({ id: `${BLOCK_PREFIX}${key}` });
  const errors = errorsByPath.get(key) ?? [];

  const isAnd = node.op === "and";
  const firstField = fieldsInScope[0];

  return (
    <div
      ref={setDropRef}
      data-over={isOver || undefined}
      className={`rb-block ${isAnd ? "rb-block--and" : "rb-block--or"}`}
    >
      <div className="rb-block-head">
        {path.length > 0 && (
          <span
            ref={drag.setNodeRef}
            {...drag.listeners}
            {...drag.attributes}
            className="rb-grip"
            aria-label="Trage grupul"
            role="button"
            tabIndex={0}
          >
            ⠿
          </span>
        )}

        <button
          type="button"
          onClick={() =>
            onChange(
              replaceAt(root, path, { ...node, op: isAnd ? "or" : "and" }),
            )
          }
          className={`rb-chip ${isAnd ? "rb-chip--and" : "rb-chip--or"}`}
          title="Comută între ȘI / SAU"
        >
          {isAnd ? "ȘI · toate" : "SAU · oricare"}
        </button>

        <BlockControls path={path} root={root} onChange={onChange} />
      </div>

      {errors.length > 0 && (
        <ul className="rb-block-errors" style={{ paddingLeft: 0 }}>
          {errors.map((error, i) => (
            <li key={i} className="rb-block-error">
              {error}
            </li>
          ))}
        </ul>
      )}

      <div className="rb-mouth">
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
          <p className="rb-slot" data-over={isOver || undefined}>
            Trage un bloc aici
          </p>
        )}

        <div className="rb-add-row">
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
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rb-add-btn"
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
  const drag = useDraggable({ id: `${BLOCK_PREFIX}${key}` });

  return (
    <div className="rb-block rb-block--not">
      <div className="rb-block-head">
        <span
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className="rb-grip"
          aria-label="Trage blocul"
          role="button"
          tabIndex={0}
        >
          ⠿
        </span>
        <span className="rb-chip rb-chip--not">NU</span>

        <BlockControls
          path={path}
          root={root}
          onChange={onChange}
          canWrap={false}
          leading={
            <IconButton
              label="Elimină negația"
              onClick={() => onChange(replaceAt(root, path, node.child))}
            >
              ⤴
            </IconButton>
          }
        />
      </div>

      <div className="rb-mouth">
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
  const drag = useDraggable({ id: `${BLOCK_PREFIX}${key}` });
  const errors = errorsByPath.get(key) ?? [];

  const field = fieldsInScope.find((f) => f.path === node.path);
  const custom = field?.source === "custom";
  const unknown = !field;

  const tone = unknown
    ? "rb-block--compare-error"
    : custom
      ? "rb-block--compare-custom"
      : "rb-block--compare";

  function update(next: Partial<Extract<Condition, { path: string }>>) {
    onChange(replaceAt(root, path, { ...node, ...next } as Condition));
  }

  function changeField(nextPath: string) {
    const nextField = fieldsInScope.find((f) => f.path === nextPath);
    if (!nextField) return;
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

  return (
    <div className={`rb-block ${tone}`}>
      <div className="rb-block-head">
        <span
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          className="rb-grip"
          aria-label="Trage condiția"
          role="button"
          tabIndex={0}
        >
          ⠿
        </span>

        <select
          aria-label="Variabilă"
          className="rb-reporter"
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
          className="rb-reporter"
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
              ? onChange(
                  replaceAt(root, path, { op: node.op, path: node.path }),
                )
              : update({ value })
          }
        />

        <BlockControls path={path} root={root} onChange={onChange} />
      </div>

      {field?.type && (
        <p className="rb-block-meta">
          {field.path} · {field.type}
        </p>
      )}

      {errors.length > 0 && (
        <ul className="rb-block-errors">
          {errors.map((error, i) => (
            <li key={i} className="rb-block-error">
              {error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
