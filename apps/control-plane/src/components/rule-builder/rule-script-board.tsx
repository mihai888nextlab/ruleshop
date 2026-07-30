"use client";

import type {
  Action,
  Condition,
  ContextSchema,
  DecisionType,
  FieldDef,
} from "@ruleshop/engine";
import { useDraggable } from "@dnd-kit/core";
import {
  ACTION_PREFIX,
  ConditionDragRoot,
  ConditionMouth,
  ConditionPalette,
  RootLogicToggle,
} from "./condition-tree";
import {
  ActionList,
  ACTIONS,
  actionsForScope,
  type ActionMeta,
} from "./action-list";

/**
 * Scratch-style board: left palette, right Dacă→Atunci C-block.
 */
export function RuleScriptBoard({
  conditions,
  onConditionsChange,
  actions,
  onActionsChange,
  decisionType,
  schema,
  fieldsInScope,
  errorsByPath,
  actionErrors,
  themeKeys,
}: {
  conditions: Condition;
  onConditionsChange: (next: Condition) => void;
  actions: Action[];
  onActionsChange: (next: Action[]) => void;
  decisionType: DecisionType;
  schema: ContextSchema;
  fieldsInScope: FieldDef[];
  errorsByPath: Map<string, string[]>;
  actionErrors: string[];
  themeKeys: string[];
}) {
  const actionMetas = actionsForScope(decisionType);

  function addAction(actionType: string) {
    const meta = ACTIONS.find((a) => a.type === actionType);
    if (!meta) return;
    onActionsChange([...actions, meta.create()]);
  }

  return (
    <ConditionDragRoot
      value={conditions}
      onChange={onConditionsChange}
      schema={schema}
      fieldsInScope={fieldsInScope}
      onAddAction={addAction}
    >
      <div className="rb-workspace">
        <aside className="rb-palette">
          <p className="rb-palette-title">Blocuri</p>
          <ConditionPalette fields={fieldsInScope} />
          <div className="rb-palette-group">
            <p className="rb-palette-label">Acțiuni</p>
            {actionMetas.map((meta) => (
              <ActionBrick
                key={meta.type}
                meta={meta}
                onClick={() => addAction(meta.type)}
              />
            ))}
          </div>
        </aside>

        <div className="rb-script-pane">
          <div className="rb-cblock" role="group" aria-label="Dacă → Atunci">
            <div className="rb-cblock-bar rb-cblock-bar--if">
              <span className="rb-cblock-notch" aria-hidden />
              <span className="rb-cblock-word">Dacă</span>
              <RootLogicToggle
                value={conditions}
                onChange={onConditionsChange}
              />
            </div>

            <div className="rb-cblock-mouth rb-cblock-mouth--if">
              <ConditionMouth
                value={conditions}
                onChange={onConditionsChange}
                schema={schema}
                fieldsInScope={fieldsInScope}
                errorsByPath={errorsByPath}
              />
            </div>

            <div className="rb-cblock-bar rb-cblock-bar--then">
              <span className="rb-cblock-word">Atunci</span>
              <span className="rb-cblock-hint">
                {actions.length === 1
                  ? "1 acțiune"
                  : `${actions.length} acțiuni`}
              </span>
            </div>

            <div className="rb-cblock-mouth rb-cblock-mouth--then">
              <ActionList
                actions={actions}
                decisionType={decisionType}
                onChange={onActionsChange}
                errors={actionErrors}
                themeKeys={themeKeys}
              />
            </div>

            <div className="rb-cblock-end" aria-hidden />
          </div>
        </div>
      </div>
    </ConditionDragRoot>
  );
}

function ActionBrick({
  meta,
  onClick,
}: {
  meta: ActionMeta;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${ACTION_PREFIX}${meta.type}`,
    data: { label: meta.label },
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      data-dragging={isDragging || undefined}
      className="rb-brick rb-brick--action"
      title="Trage în Atunci sau apasă pentru a adăuga"
    >
      {meta.label}
    </button>
  );
}
