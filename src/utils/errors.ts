export function defineError<TType extends string, TArgs extends unknown[], TResult extends object>(
  type: TType,
  build?: (...args: TArgs) => TResult,
) {
  return (...args: TArgs) =>
    ({
      type,
      ...(build ? build(...args) : {}),
    }) as Pretty<{ type: TType } & TResult>;
}
