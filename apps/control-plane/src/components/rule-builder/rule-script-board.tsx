"use client";

import { useT } from "@/components/i18n-provider";
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
  const t = useT();
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
          <p className="rb-palette-title">{t("rules.blocks")}</p>
          <ConditionPalette fields={fieldsInScope} />
          <div className="rb-palette-group">
            <p className="rb-palette-label">{t("rules.actions")}</p>
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
          <div className="rb-cblock" role="group" aria-label={`${t("rules.when")} → ${t("rules.thenBlock")}`}>
            <div className="rb-cblock-bar rb-cblock-bar--if">
              <span className="rb-cblock-notch" aria-hidden />
              <span className="rb-cblock-word">{t("rules.when")}</span>
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
              <span className="rb-cblock-word">{t("rules.thenBlock")}</span>
              <span className="rb-cblock-hint">
                {actions.length === 1
                  ? t("rules.oneAction")
                  : t("rules.nActions", { n: actions.length })}
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
