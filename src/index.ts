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

export class PaginatedMenu<T extends Context> extends Menu<T> {
  protected perPage: number;
  protected getTotal: (ctx: T) => Promise<number>;
  protected style?: PaginatedMenuStyle<T>;

  constructor(
    name: string,
    options: {
      perPage: number;
      getTotal: (ctx: T) => Promise<number>;
      style?: PaginatedMenuStyle<T>;
    }
  ) {
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

  protected getPages = async (ctx: T) =>
    Math.ceil((await this.getTotal(ctx)) / this.perPage);

  protected getPage = (ctx: T) => Number(ctx.match || 1);

  protected payload = {
    current: (ctx: T) => this.getPage(ctx).toString(),
    previous: (ctx: T) => Math.max(1, this.getPage(ctx) - 1).toString(),
    next: async (ctx: T) =>
      Math.min(await this.getPages(ctx), this.getPage(ctx) + 1).toString(),
  };

  public paginated<E>(config: {
    total: (ctx: T) => MaybePromise<number>;
    data: (pagination: MenuPagination, ctx: T) => MaybePromise<E[]>;
    builder: (
      pagination: MenuPagination,
      range: MenuRange<T>,
      item: E,
      payload: string
    ) => MaybePromise<void> | void;
  }) {
    console.log(this.style);
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
