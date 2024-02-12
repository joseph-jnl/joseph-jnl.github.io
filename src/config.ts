import type { Site, SocialObjects } from "./types";

export const SITE: Site = {
  website: "https://joseph-jnl.github.io", // replace this with your deployed domain
  author: "Joseph Lee",
  desc: "Joe's personal blog.",
  title: "A few posts",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerPage: 3,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
};

export const LOCALE = {
  lang: "en", // html lang code. Set this empty and default will be "en"
  langTag: ["en-EN"], // BCP 47 Language Tags. Set this empty [] to use the environment default
} as const;

export const LOGO_IMAGE = {
  enable: false,
  svg: true,
  width: 216,
  height: 46,
};

export const SOCIALS: SocialObjects = [
  {
    name: "Github",
    href: "https://github.com/joseph-jnl/",
    linkTitle: `joseph-jnl on Github`,
    active: true,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/joseph-nw-lee/",
    linkTitle: `Joseph Lee on LinkedIn`,
    active: true,
  },
  {
    name: "Mail",
    href: "mailto:joseph.nw.lee+fromgithub@gmail.com",
    linkTitle: `Send an email to ${SITE.title}`,
    active: true,
  },
];
