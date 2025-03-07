const { 
  Telegraf,
  Markup
} = require('telegraf')
const { message } = require('telegraf/filters')
require('dotenv').config()
const my_const = require('./const')

const bot = new Telegraf(process.env.BOT_TOKEN)
bot.start((ctx) => ctx.reply(`Привет ${ctx.message.from.first_name ? ctx.message.from.first_name :
'незнакомец'}!`))
bot.help((ctx) => ctx.reply(my_const.commands))

bot.command('departments', async (ctx) => {
  try {
    await ctx.replyWithHTML(`<b>Подразделения</b>` , Markup.inlineKeyboard(
      [
        [Markup.button.callback('Редактировать', 'btn_1'), Markup.button.callback('Установить цель', 'btn_2'), 
        Markup.button.callback('Добавить пользователя', 'btn_3')],
      ]
    ))
  } catch(e) {
    console.error(e)
  }
})

function addActionBot(id_btn, src_img, text, preview) {
  bot.action(id_btn, async (ctx) => {
    try {
      await ctx.answerCbQuery()
      if (src_img !== false) {
        await ctx.replyWithPhoto({
          source: src_img
        })
      }
      await ctx.replyWithHTML(text, {
        disable_web_page_preview: preview
      })
    } catch (e) {
      console.error(e)
    }
  })
}

addActionBot('btn_1', './img/1.jpg')
addActionBot('btn_2', './img/2.jpg')
addActionBot('btn_3', false)


bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))