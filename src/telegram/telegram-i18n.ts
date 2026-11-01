export type Lang = 'en' | 'am';

export const T = {
  en: {
    welcomeFirstTime:
      '👋 *Welcome to Barter Ethio!*\n\n' +
      'To use the bot, sign in once with your Barter Ethio account.\n\n' +
      '📧 What is your email?',
    welcomeBack: (name: string) =>
      `👋 *Welcome back, ${name}!*\n\nTap *Browse* to see what people are looking for.`,
    askPassword:
      '🔑 Now enter your password.\n_(I will delete your message right after.)_',
    loginOk: (name: string) =>
      `✅ *Welcome, ${name}!*\n\nYou can now browse the wanted board any time. ` +
      `No need to log in again.`,
    loginFail:
      '❌ Email or password is incorrect.\n\nLet\'s try again — what is your email?',
    badEmail: '❌ That doesn\'t look like a valid email. Try again:',
    badPassword: '❌ Password too short (min 6 characters). Try again:',
    cannotReachServer:
      '⚠️ Can\'t reach the server right now. Try again in a moment.',
    cancelled: '❌ Cancelled.',
    langSwitched: '🌐 Language switched to English.',

    browseEmpty: '📭 No active requests right now.',
    browsePage: (page: number, total: number) =>
      `📋 *Wanted board — page ${page}/${total}*`,
    browseTitle: '📋 *Wanted board*',
  },
  am: {
    welcomeFirstTime:
      '👋 *ወደ Barter Ethio እንኳን ደህና መጡ!*\n\n' +
      'ቦቱን ለመጠቀም አንድ ጊዜ በ Barter Ethio መለያዎ ይግቡ።\n\n' +
      '📧 ኢሜይልዎ ምንድነው?',
    welcomeBack: (name: string) =>
      `👋 *እንኳን ደህና መጡ፣ ${name}!*\n\nሰዎች ምን እየፈለጉ እንደሆነ ለማየት *Browse* ይጫኑ።`,
    askPassword:
      '🔑 አሁን ፓስወርድዎን ያስገቡ።\n_(መልእክትዎን ወዲያውኑ አጠፋለሁ።)_',
    loginOk: (name: string) =>
      `✅ *እንኳን ደህና መጡ፣ ${name}!*\n\nአሁን ማንኛውም ጊዜ የጥያቄዎችን ሰሌዳ ማየት ይችላሉ። ` +
      `እንደገና መግባት አያስፈልግም።`,
    loginFail:
      '❌ ኢሜይል ወይም ፓስወርድ ትክክል አይደለም።\n\nእንደገና እንሞክር — ኢሜይልዎ ምንድነው?',
    badEmail: '❌ ትክክለኛ ኢሜይል አይመስልም። እንደገና ይሞክሩ፡',
    badPassword: '❌ ፓስወርድ በጣም አጭር ነው (ቢያንስ 6 ፊደል)። እንደገና ይሞክሩ፡',
    cannotReachServer: '⚠️ አሁን ሰርቨሩን ማግኘት አልተቻለም። እንደገና ይሞክሩ።',
    cancelled: '❌ ተሰርዟል።',
    langSwitched: '🌐 ቋንቋ ወደ አማርኛ ተቀይሯል።',

    browseEmpty: '📭 አሁን ምንም ጥያቄ የለም።',
    browsePage: (page: number, total: number) =>
      `📋 *የጥያቄዎች ሰሌዳ — ገጽ ${page}/${total}*`,
    browseTitle: '📋 *የጥያቄዎች ሰሌዳ*',
  },
} as const;

export const t = (lang: Lang) => T[lang] ?? T.en;