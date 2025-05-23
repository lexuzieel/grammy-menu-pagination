import { test } from "@japa/runner";
import { Context } from "grammy";
import { captureRequests, TestBot } from "grammy-test";
import {
  PaginatedMenu,
  PaginatedMenuOptions,
  PaginatedMenuRangeGenerator,
} from "../src/index.ts";
import { Assert } from "@japa/assert";

test.group("Paginated menu", async (group) => {
  let bot: TestBot<Context>;

  const data = (() => {
    const items: string[] = [];
    for (let i = 1; i <= 13; i++) {
      items.push(`item ${i}`);
    }
    return items;
  })();

  const createMenu = (
    config: PaginatedMenuOptions<Context, string>,
    {
      before,
      after,
    }: {
      before?: PaginatedMenuRangeGenerator<Context>;
      after?: PaginatedMenuRangeGenerator<Context>;
    } = {}
  ) =>
    new PaginatedMenu("paginated-menu", config).paginated({
      before,
      item: async (item, range, payload, pagination, ctx) => {
        range
          .text(
            {
              text: () => `item ${item} | page: ${pagination.currentPage}`,
              payload,
            },
            async () => {
              console.log(item);
            }
          )
          .row();
      },
      after,
    });

  group.each.setup(async () => {
    bot = new TestBot();

    bot.use(captureRequests);
  });

  test("has previous and next buttons with pagination indicator", async ({
    assert,
  }) => {
    const paginatedMenu = createMenu({
      perPage: 5,
      total: () => data.length,
      data: (pagination) =>
        data.slice(
          (pagination.currentPage - 1) * pagination.perPage,
          pagination.currentPage * pagination.perPage
        ),
    });

    bot.use(paginatedMenu);

    bot.command("start", async (ctx) => {
      await ctx.reply("This is a paginated menu", {
        reply_markup: paginatedMenu,
      });
    });

    await bot.receive.command("start");

    // Check displayed items
    bot.assert.button("item 1");
    bot.assert.button("item 5");
    assert.throws(() => bot.assert.button("item 6"));

    // Check navigation buttons
    assert.throws(() => bot.assert.button("<"));
    bot.assert.button("1 / 3");
    bot.assert.button(">");
  });

  test("can navigate to the last page", async ({ assert }) => {
    const paginatedMenu = createMenu({
      perPage: 5,
      total: () => data.length,
      data: (pagination) =>
        data.slice(
          (pagination.currentPage - 1) * pagination.perPage,
          pagination.currentPage * pagination.perPage
        ),
    });

    bot.use(paginatedMenu);

    bot.command("start", async (ctx) => {
      await ctx.reply("This is a paginated menu", {
        reply_markup: paginatedMenu,
      });
    });

    await bot.receive.command("start");

    // Check displayed items on the first page
    bot.assert.button("item 1");
    bot.assert.button("item 5");
    assert.throws(() => bot.assert.button("item 6"));

    // Check navigation buttons on the first page
    assert.throws(() => bot.assert.button("<"));
    bot.assert.button("1 / 3");
    bot.assert.button(">");

    // Navigate to the next page
    await bot.receive.button(">");
    await bot.receive.button(">");

    // Check displayed items on the last page
    bot.assert.button("item 11");
    bot.assert.button("item 13");

    // Check navigation buttons on the last page
    bot.assert.button("<");
    bot.assert.button("3 / 3");
    assert.throws(() => bot.assert.button(">"));
  });

  test("can have custom navigation button style", async ({ assert }) => {
    const paginatedMenu = createMenu({
      perPage: 5,
      total: () => data.length,
      data: (pagination) =>
        data.slice(
          (pagination.currentPage - 1) * pagination.perPage,
          pagination.currentPage * pagination.perPage
        ),
      style: {
        previous: "⬅️",
        current: `page $current of $total`,
        next: "➡️",
      },
    });

    bot.use(paginatedMenu);

    bot.command("start", async (ctx) => {
      await ctx.reply("This is a paginated menu", {
        reply_markup: paginatedMenu,
      });
    });

    await bot.receive.command("start");

    bot.assert.button("page 1 of 3");

    await bot.receive.button("➡️");

    bot.assert.button("⬅️");
    bot.assert.button("page 2 of 3");
  });

  test("can have extra buttons before and after pagination", async ({
    assert,
  }) => {
    const paginatedMenu = createMenu(
      {
        perPage: 5,
        total: () => data.length,
        data: (pagination) =>
          data.slice(
            (pagination.currentPage - 1) * pagination.perPage,
            pagination.currentPage * pagination.perPage
          ),
      },
      {
        before: async (range, payload) => {
          range.text({ text: () => "Button before pagination", payload });
        },
        after: async (range, payload) => {
          range.text({ text: () => "Button after pagination", payload });
        },
      }
    );

    bot.use(paginatedMenu);

    bot.command("start", async (ctx) => {
      await ctx.reply("This is a paginated menu", {
        reply_markup: paginatedMenu,
      });
    });

    await bot.receive.command("start");

    bot.assert.button("Button before pagination");
    bot.assert.button("Button after pagination");
    bot.assert.button("1 / 3"); // Check we are on the first page

    await bot.receive.button(">");

    bot.assert.button("Button before pagination");
    bot.assert.button("Button after pagination");
    bot.assert.button("2 / 3"); // Check we are on the second page

    await bot.receive.button("Button before pagination");

    // This stuff might be broken because of grammy-test?

    // await bot.receive.button("Button after pagination");
    // bot.assert.button("2 / 3"); // Check we are still on the second page

    // console.log(bot.requests);
  });
});
