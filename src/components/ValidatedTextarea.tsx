/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import { TextareaWithActions, Action } from './TextareaWithActions.tsx';
import { FC } from 'hono/jsx';

const DEFAULT_ACTION_CLASS =
  'px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded transition-colors flex items-center gap-1';
const DEFAULT_VALIDATE_CLASS =
  'px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-1';

const createAction = (action: Partial<Action> = {}, defaults: Partial<Action> = {}): Action => {
  const final: Action = {
    key: action.key,
    icon: action.icon,
    label: action.label,
    hideLabelOnMobile: action.hideLabelOnMobile,
    className: action.className || defaults.className,
    title: action.title || action.label,
    attrs: action.attrs || defaults.attrs || {}
  };
  return final;
};

interface ValidationMessageConfig {
  show?: string;
  className?: string;
  icon?: string;
  text?: string;
  textExpr?: string;
}

const renderValidationMessage = (config: ValidationMessageConfig | undefined, fallbackClass: string, defaultIcon: string) => {
  if (!config) return null;
  const attrs: Record<string, any> = {};
  if (config.show) {
    attrs['x-show'] = config.show;
  }
  return (
    <div class={config.className || fallbackClass} {...attrs}>
      <i class={config.icon || defaultIcon}></i>
      {config.text ? (
        <span>{config.text}</span>
      ) : config.textExpr ? (
        <span x-text={config.textExpr}></span>
      ) : null}
    </div>
  );
};

interface ValidatedTextareaProps {
  id: string;
  name: string;
  label?: string;
  model?: string;
  paste?: boolean | Partial<Action>;
  clear?: boolean | Partial<Action>;
  pasteLabel?: string;
  clearLabel?: string;
  pasteTitle?: string;
  clearTitle?: string;
  labelActions?: Action[];
  inlineActions?: Action[];
  validation?: {
    button?: Partial<Action>;
    error?: ValidationMessageConfig;
    success?: ValidationMessageConfig;
  };
  placeholder?: string;
  rows?: number;
  variant?: 'default' | 'mono';
  containerClass?: string;
  textareaClass?: string;
  labelWrapperClass?: string;
  labelActionsWrapperClass?: string;
  inlineActionsWrapperClass?: string;
  textareaAttrs?: Record<string, any>;
  preserveLabelSpace?: boolean;
  children?: any;
}

export const ValidatedTextarea: FC<ValidatedTextareaProps> = (props) => {
  const {
    model,
    paste = true,
    clear = true,
    pasteLabel = 'Paste',
    clearLabel = 'Clear',
    pasteTitle = pasteLabel,
    clearTitle = clearLabel,
    labelActions = [],
    inlineActions = [],
    validation = {},
    children,
    ...rest
  } = props;

  const computedLabelActions = [...labelActions];
  if (paste && model) {
    const pasteConfig = typeof paste === 'object' ? paste : {};
    computedLabelActions.push(
      createAction(
        {
          key: pasteConfig.key || `paste-${model}`,
          icon: pasteConfig.icon || 'fas fa-paste',
          label: pasteConfig.label || pasteLabel,
          hideLabelOnMobile: pasteConfig.hideLabelOnMobile !== false,
          className:
            pasteConfig.className ||
            `${DEFAULT_ACTION_CLASS} hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600 dark:hover:text-primary-400`,
          title: pasteConfig.title || pasteTitle,
          attrs:
            pasteConfig.attrs || {
              'x-on:click': `navigator.clipboard.readText().then(text => ${model} = text).catch(() => {})`
            }
        },
        {}
      )
    );
  }

  if (clear && model) {
    const clearConfig = typeof clear === 'object' ? clear : {};
    computedLabelActions.push(
      createAction(
        {
          key: clearConfig.key || `clear-${model}`,
          icon: clearConfig.icon || 'fas fa-times',
          label: clearConfig.label || clearLabel,
          hideLabelOnMobile: clearConfig.hideLabelOnMobile !== false,
          className:
            clearConfig.className ||
            `${DEFAULT_ACTION_CLASS} hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400`,
          title: clearConfig.title || clearTitle,
          attrs:
            clearConfig.attrs || {
              'x-on:click': `${model} = ''`,
              'x-show': model
            }
        },
        {}
      )
    );
  }

  const computedInlineActions = [...inlineActions];
  if (validation?.button) {
    computedInlineActions.push(
      createAction(validation.button, {
        className: DEFAULT_VALIDATE_CLASS,
        attrs: {}
      })
    );
  }

  return (
    <TextareaWithActions
      {...rest}
      id={rest.id || ''}
      name={rest.name || ''}
      model={model}
      labelActions={computedLabelActions}
      inlineActions={computedInlineActions}
    >
      {children}
      {renderValidationMessage(
        validation?.error,
        'mt-2 text-red-500 text-sm flex items-center gap-1',
        'fas fa-exclamation-circle'
      )}
      {renderValidationMessage(
        validation?.success,
        'mt-2 text-green-500 text-sm flex items-center gap-1',
        'fas fa-check-circle'
      )}
    </TextareaWithActions>
  );
};
