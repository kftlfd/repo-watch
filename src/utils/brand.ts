const brand = Symbol('brand');

export type Branded<T, B> = T & {
  readonly [brand]: B;
};
