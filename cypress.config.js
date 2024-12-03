const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    baseUrl: "http://localhost:3000/app/e2e/",
    specPattern: ["cypress/e2e/**/*.cy.{js,jsx,ts,tsx}"],
  },
});
