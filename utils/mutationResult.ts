export type MutationAction = 'created' | 'updated' | 'deleted' | 'deactivated' | 'blocked';

export interface MutationResult<T = string> {
  ok: boolean;
  action: MutationAction;
  messageKey?: string;
  reason?: string;
  entityId?: string;
  data?: T;
}

export const createSuccess = <T = string>(action: MutationAction, entityId?: string, data?: T): MutationResult<T> => ({
  ok: true,
  action,
  entityId,
  data,
});

export const createError = (action: MutationAction, messageKey: string, reason?: string): MutationResult<any> => ({
  ok: false,
  action,
  messageKey,
  reason,
});
