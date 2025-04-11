import { test } from "@japa/runner";
import { Context } from "grammy";
import { captureRequests, TestBot } from "grammy-test";
import { PaginatedMenu } from "../src/index.ts";
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

  const paginatedMenu = new PaginatedMenu<Context>("paginated-menu", {
    perPage: 5,
    getTotal: async (ctx) => data.length,
    style: {
      // previous: "⬅️",
      // current: async (ctx) => `$current ${ctx.t("separator")} $total`,
      // next: "➡️",
      // current: "",
    },
  }).paginated({
    total: async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));

      return data.length;
    },
    data: async (pagination) => {
      // console.log("fetching page", pagination.currentPage);

      await new Promise((resolve) => setTimeout(resolve, 100));

      return data.slice(
        (pagination.currentPage - 1) * pagination.perPage,
        pagination.currentPage * pagination.perPage
      );
    },
    builder: async (pagination, range, item, payload) => {
      // console.log("building item", item);

      range
        .text(
          {
            text: (ctx) => `item ${item} | page: ${pagination.currentPage}`,
            payload,
          },
          async (ctx) => {
            console.log(item);
          }
        )
        .row();
    },
  });

  group.each.setup(async () => {
    bot = new TestBot();

    bot.use(captureRequests);
  });

  test("has previous and next buttons with pagination indicator", async ({
    assert,
  }) => {
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
});
