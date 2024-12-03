describe('Get values from run-configuration', () => {
  // Go to configuration
  beforeEach(() => {
    cy.visit('public?config=/api/v2/configuration/e2e/configuration_base_config_674d951953187450530183.json')
  })

  // Is brandname set from config
  it('brandname should be set to "e2e Test"', () => {
    cy.get('.navbar-brand span').first().should('have.text', 'e2e test')
  })

  // Is startup modal conent set from config
  it('startup modal content should be set from config', () => {
    cy.get('#startup-message-modal .modal-body p').should('have.text', 'this is startup content')
  })
 

  // Is about modal conent set from config
  it('about modal content should be set from config', () => {
    // wait, then close the startup modal
    cy.wait(1000)
    cy.get('.btn.btn-secondary.js-close-modal').click()

    cy.get('a.nav-link.dropdown-toggle').click()
    cy.get('a[data-bs-toggle="modal"]').first().click()
    cy.get('#about-modal .modal-body p').should('have.text', 'this has content')
  })


})
