import { Context, Schema, h } from 'koishi'

const crypto = require('crypto')

export const name = 'anonymous'

export const usage = `
指令需要私聊机器人使用
`

export interface AnonymousData {
  id: number
  userId: string
  anonymousId: string
  guildId: string
}

declare module 'koishi' {
  interface Tables {
    anonymousData: AnonymousData
  }
}

export interface Config {
  敏感词: string[]
  禁止图片: boolean
}

export const Config: Schema<Config> = Schema.object({
  敏感词:Schema.array(Schema.string())
    .description("禁止发送的文字，支持正则表达式"),
  禁止图片:Schema.boolean()
    .description("是否禁止发送图片")
    .default(false)

})

export const inject = ['database']

export function apply(ctx: Context, config: Config) {
  extendTables(ctx)
  let current = {}

  ctx.private().command("匿名消息.设置群聊 <guildId:string>", "发送匿名消息的群聊").alias("设置匿名群聊")
    .action(async ({session}, guildId) => {
      let flag
      for await (let i of session.bot.getGuildIter()) {
        if (i.id === guildId) flag = true
      }
      if (!flag) return h("quote", {id: session.event.message.id}) + "仅能在机器人所在的群聊发送匿名消息"
      let data = await ctx.database.get('anonymousData', {
        userId: session.userId,
        guildId: guildId
      })

      if (data.length === 0) {
        while (true) {
          current[session.event.user.id] = {
            guildId: guildId, 
            anonymousId: crypto.randomBytes(Math.ceil(8 / 2)).toString('hex').slice(0, 8)
          }
          let check = await ctx.database.get('anonymousData', {anonymousId: current[session.event.user.id].anonymousId})
          if (check.length === 0) break
        }
        await ctx.database.create('anonymousData', {
          userId: session.event.user.id,
          guildId: guildId,
          anonymousId: current[session.event.user.id].anonymousId
        })
      } else {
        current[session.event.user.id] = {
          guildId: guildId, 
          anonymousId: data[0].anonymousId
        }
      }

      return h("quote", {id: session.event.message.id}) + `设置成功，你在该群的匿名ID为 ${current[session.event.user.id].anonymousId}`

    })

  ctx.private().command('匿名消息.发送 <message:text>').alias("发送匿名消息")
    .action(async ({session}, message) => {
      if (current[session.event.user.id] === undefined) {
        return h("quote", {id: session.event.message.id}) + "你还没有设置群聊，请使用指令：匿名消息.设置群聊 <群聊ID>"
      }
      for (let i of config.敏感词) {
        if (new RegExp(`${i}`).test(message)) return h("quote", {id: session.event.message.id}) + "你发送的文本包含禁止发送的内容"
      }
      if (config.禁止图片 && message.includes('<image url="')) return h("quote", {id: session.event.message.id}) + "禁止发送图片"

      await session.bot.sendMessage(current[session.event.user.id].guildId, `【匿名消息】用户：${current[session.event.user.id].anonymousId}\n${message}`)
      return h("quote", {id: session.event.message.id}) + "发送成功"
    })

}

async function extendTables(ctx: Context) {
  await ctx.model.extend('anonymousData', {
    id: "unsigned",
    userId: "text",
    anonymousId: "text",
    guildId: "text"
  }, { primary: "id", autoInc: true })
}
