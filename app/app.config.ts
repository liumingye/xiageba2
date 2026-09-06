export default defineAppConfig({
  ui: {
    colors: {
      primary: "green",
      neutral: "zinc",
    },
    radius: 0.25,
    navigationMenu: {
      variants: {
        active: {
          false: {
            link: "text-toned",
            linkLeadingIcon: "text-toned",
          },
        },
      },
    },
  },
});
