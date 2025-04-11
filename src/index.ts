import { Menu, MenuRange } from "@grammyjs/menu";
import { Context } from "grammy";

type MenuPagination = {
  total: number;
  perPage: number;
  currentPage: number;
};

type MaybePromise<T> = T | Promise<T>;

type MaybeString<C extends Context> =
  | string
  | ((ctx: C) => MaybePromise<string>);

type PaginatedMenuStyle<C extends Context> = {
  previous?: MaybeString<C>;
  current?: MaybeString<C>;
  next?: MaybeString<C>;
};

export type PaginatedMenuOptions<C extends Context> = {
  perPage: number;
  getTotal: (ctx: C) => MaybePromise<number>;
  style?: PaginatedMenuStyle<C>;
};

export class PaginatedMenu<C extends Context> extends Menu<C> {
  protected perPage: number;
  protected getTotal: (ctx: C) => MaybePromise<number>;
  protected style?: PaginatedMenuStyle<C>;

  constructor(name: string, options: PaginatedMenuOptions<C>) {
    super(name, {
      fingerprint: (ctx) => `page:${this.getPage(ctx)}`,
      onMenuOutdated: async (ctx) => {
        await ctx.menu.update({ immediate: true });
      },
    });

    this.perPage = options.perPage;
    this.getTotal = options.getTotal;
    this.style = options.style;
  }

  protected getPages = async (ctx: C) =>
    Math.ceil((await this.getTotal(ctx)) / this.perPage);

  protected getPage = (ctx: C) => Number(ctx.match || 1);

  protected payload = {
    current: (ctx: C) => this.getPage(ctx).toString(),
    previous: (ctx: C) => Math.max(1, this.getPage(ctx) - 1).toString(),
    next: async (ctx: C) =>
      Math.min(await this.getPages(ctx), this.getPage(ctx) + 1).toString(),
  };

  public paginated<E>(config: {
    total: (ctx: C) => MaybePromise<number>;
    data: (pagination: MenuPagination, ctx: C) => MaybePromise<E[]>;
    builder: (
      pagination: MenuPagination,
      range: MenuRange<C>,
      item: E,
      payload: string
    ) => MaybePromise<void> | void;
  }) {
    this.dynamic(async (ctx, range) => {
      const pagination = {
        total: await config.total(ctx),
        perPage: this.perPage,
        currentPage: this.getPage(ctx),
      } as MenuPagination;

      const items = await config.data(pagination, ctx);

      for (const item of items) {
        config.builder(pagination, range, item, this.payload.current(ctx));
      }

      range.row();
    });

    this.text({
      text: async (ctx) => {
        const show = this.getPage(ctx) > 1;

        if (!show) {
          return " ";
        }

        return typeof this.style?.previous === "function"
          ? await this.style?.previous(ctx)
          : this.style?.previous ?? "<";
      },
      payload: (ctx) => this.payload.previous(ctx),
    });

    if (this.style?.current !== "") {
      this.text({
        text: async (ctx) => {
          const current = this.getPage(ctx);
          const total = await this.getPages(ctx);
          const template =
            typeof this.style?.current === "function"
              ? await this.style?.current(ctx)
              : this.style?.current ?? "$current / $total";

          return template
            .replace("$current", current.toString())
            .replace("$total", total.toString());
        },
        payload: (ctx) => this.payload.current(ctx),
      });
    }

    this.text({
      text: async (ctx) => {
        const show = this.getPage(ctx) < (await this.getPages(ctx));

        if (!show) {
          return " ";
        }

        return typeof this.style?.next === "function"
          ? await this.style?.next(ctx)
          : this.style?.next ?? ">";
      },
      payload: (ctx) => this.payload.next(ctx),
    });

    return this;
  }
}
