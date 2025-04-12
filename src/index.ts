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

export type PaginatedMenuOptions<C extends Context, T extends any> = {
  /**
   * The style of the pagination buttons.
   *
   * @example
   * ```ts
   * {
   *   previous: "⬅️",
   *   current: "$current of $total",
   *   next: "➡️",
   * }
   * ```
   */
  style?: PaginatedMenuStyle<C>;

  /**
   * The total number of items to paginate.
   *
   * Use this to fetch the total number of items from the database.
   */
  total: (ctx: C) => MaybePromise<number>;

  /**
   * The data to display for the current page.
   *
   * Use this to fetch the data from the database
   * from the range using the `pagination` object.
   */
  data: (pagination: MenuPagination, ctx: C) => MaybePromise<T[]>;

  /**
   * The number of items to display per page.
   */
  perPage: number;
};

type PaginatedMenuPayload = {
  page: number;
};

export class PaginatedMenu<C extends Context, T extends any> extends Menu<C> {
  private paginationOptions: PaginatedMenuOptions<C, T>;

  constructor(name: string, options: PaginatedMenuOptions<C, T>) {
    super(name, {
      fingerprint: (ctx) => `page:${this.getPage(ctx)}`,
      onMenuOutdated: async (ctx) => {
        this.clearTotalCache();
        await ctx.menu.update({ immediate: true });
      },
    });

    this.paginationOptions = options;
  }

  protected packPayload(payload: PaginatedMenuPayload) {
    return JSON.stringify(payload);
  }

  protected unpackPayload(ctx: C) {
    const payload = ctx.match;

    if (typeof payload !== "string" || payload.trim() === "") {
      return { page: 1 };
    }

    return JSON.parse(payload) as PaginatedMenuPayload;
  }

  private cachedTotal: number | undefined;

  private getTotal = async (ctx: C) => {
    if (this.cachedTotal === undefined) {
      this.cachedTotal = await this.paginationOptions.total(ctx);
    }

    return this.cachedTotal;
  };

  private clearTotalCache = () => {
    this.cachedTotal = undefined;
  };

  protected getPages = async (ctx: C) =>
    Math.ceil((await this.getTotal(ctx)) / this.paginationOptions.perPage);

  protected getPage = (ctx: C) => this.unpackPayload(ctx).page || 1;

  protected payload = {
    current: (ctx: C) => this.packPayload({ page: this.getPage(ctx) }),
    previous: (ctx: C) =>
      this.packPayload({ page: Math.max(1, this.getPage(ctx) - 1) }),
    next: async (ctx: C) =>
      this.packPayload({
        page: Math.min(await this.getPages(ctx), this.getPage(ctx) + 1),
      }),
  };

  protected appendNavigationButtons = () => {
    this.text({
      text: async (ctx) => {
        const show = this.getPage(ctx) > 1;
        const style = this.paginationOptions.style?.previous;

        if (!show) {
          return " ";
        }

        return typeof style === "function" ? await style(ctx) : style ?? "<";
      },
      payload: (ctx) => this.payload.previous(ctx),
    });

    if (this.paginationOptions.style?.current !== "") {
      this.text({
        text: async (ctx) => {
          const current = this.getPage(ctx);
          const total = await this.getPages(ctx);
          const style = this.paginationOptions.style?.current;

          const template =
            typeof style === "function"
              ? await style(ctx)
              : style ?? "$current / $total";

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
        const style = this.paginationOptions.style?.next;

        if (!show) {
          return " ";
        }

        return typeof style === "function" ? await style(ctx) : style ?? ">";
      },
      payload: (ctx) => this.payload.next(ctx),
    });

    return this;
  };

  public paginated(config: {
    before?: (
      range: MenuRange<C>,
      payload: string,
      pagination: MenuPagination,
      ctx: C
    ) => MaybePromise<void> | void;
    item: (
      pagination: MenuPagination,
      range: MenuRange<C>,
      item: T,
      payload: string
    ) => MaybePromise<void> | void;
    after?: (
      range: MenuRange<C>,
      payload: string,
      pagination: MenuPagination,
      ctx: C
    ) => MaybePromise<void> | void;
  }) {
    this.clearTotalCache();

    const getPagination = async (ctx: C): Promise<MenuPagination> => {
      return {
        total: await this.getTotal(ctx),
        perPage: this.paginationOptions.perPage,
        currentPage: this.getPage(ctx),
      };
    };

    if (config.before !== undefined) {
      this.dynamic(async (ctx, range) => {
        const pagination = await getPagination(ctx);
        await config.before!(range, this.payload.current(ctx), pagination, ctx);
      });
    }

    this.dynamic(async (ctx, range) => {
      const pagination = await getPagination(ctx);

      const items = await this.paginationOptions.data(pagination, ctx);

      for (const item of items) {
        config.item(pagination, range, item, this.payload.current(ctx));
      }
    });

    this.row().appendNavigationButtons().row();

    if (config.after !== undefined) {
      this.dynamic(async (ctx, range) => {
        const pagination = await getPagination(ctx);
        await config.after!(range, this.payload.current(ctx), pagination, ctx);
      });
    }

    return this;
  }
}
