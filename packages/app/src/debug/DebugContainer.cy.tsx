import { DebugSpecListGroupsFragment, DebugSpecListSpecFragment, DebugSpecListTestsFragment, DebugSpecsFragment, DebugSpecsFragmentDoc, UseCohorts_DetermineCohortDocument } from '../generated/graphql-test'
import DebugContainer from './DebugContainer.vue'
import { defaultMessages } from '@cy/i18n'
import { useLoginConnectStore } from '@packages/frontend-shared/src/store/login-connect-store'
import { specsList } from './utils/DebugMapping'
import { CloudRunStubs } from '@packages/graphql/test/stubCloudTypes'
import { DEBUG_SLIDESHOW } from './utils/constants'
import type { CloudRun, CloudSpecRun, CloudTestResult } from '@packages/graphql/src/gen/test-cloud-graphql-types.gen'

const DebugSpecVariableTypes = {
  hasNextRun: 'Boolean',
  runNumber: 'Int',
  nextRunNumber: 'Int',
}

describe('<DebugContainer />', () => {
  describe('offline', () => {
    it('shows offline message if offline', () => {
      cy.mount(() => <DebugContainer online={false}/>)

      cy.contains('You have no internet connection').should('be.visible')
    })
  })

  describe('empty states', () => {
    const validateEmptyState = (expectedMessages: string[]) => {
      cy.stubMutationResolver(UseCohorts_DetermineCohortDocument, (defineResult) => {
        return defineResult({ determineCohort: { __typename: 'Cohort', name: DEBUG_SLIDESHOW.id, cohort: 'A' } })
      })

      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        onResult: (res) => {
          if (res.currentProject) {
            res.currentProject.savedState = {
              debugSlideshowComplete: true,
            }
          }
        },
        render: (gqlVal) => <DebugContainer gql={gqlVal} />,
      })

      expectedMessages.forEach((message) => {
        cy.findByTestId('debug-empty').contains(message)
      })
    }

    it('shows not logged in', () => {
      const loginConnectStore = useLoginConnectStore()

      loginConnectStore.setHasInitiallyLoaded()

      validateEmptyState([defaultMessages.debugPage.emptyStates.connectToCypressCloud, defaultMessages.debugPage.emptyStates.debugDirectlyInCypress, defaultMessages.debugPage.emptyStates.notLoggedInTestMessage])
      cy.findByRole('button', { name: 'Connect to Cypress Cloud' }).should('be.visible')
    })

    it('is logged in with no project', () => {
      const loginConnectStore = useLoginConnectStore()

      loginConnectStore.setUserFlag('isLoggedIn', true)
      loginConnectStore.setProjectFlag('isProjectConnected', false)
      loginConnectStore.setHasInitiallyLoaded()

      validateEmptyState([defaultMessages.debugPage.emptyStates.debugDirectlyInCypress, defaultMessages.debugPage.emptyStates.reviewRerunAndDebug, defaultMessages.debugPage.emptyStates.noProjectTestMessage])
      cy.findByRole('button', { name: 'Connect a Cypress Cloud project' }).should('be.visible')
    })

    it('has no runs', () => {
      const loginConnectStore = useLoginConnectStore()

      loginConnectStore.setUserFlag('isLoggedIn', true)
      loginConnectStore.setProjectFlag('isProjectConnected', true)
      loginConnectStore.setHasInitiallyLoaded()
      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        render: (gqlVal) => <DebugContainer gql={gqlVal} />,
      })

      validateEmptyState([defaultMessages.debugPage.emptyStates.recordYourFirstRun, defaultMessages.debugPage.emptyStates.almostThere, defaultMessages.debugPage.emptyStates.noRunsTestMessage])
      cy.findByDisplayValue('npx cypress run --record --key 2aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa').should('be.visible')
    })

    it('errors', () => {
      const loginConnectStore = useLoginConnectStore()

      loginConnectStore.setUserFlag('isLoggedIn', true)
      loginConnectStore.setProjectFlag('isProjectConnected', true)
      loginConnectStore.setHasInitiallyLoaded()
      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        render: (gqlVal) => <DebugContainer gql={gqlVal} showError={true} />,
      })

      cy.findByTestId('debug-empty').should('not.exist')
      cy.findByTestId('debug-alert').should('be.visible')
    })
  })

  describe('run states', { viewportWidth: 900 }, () => {
    beforeEach(() => {
      const loginConnectStore = useLoginConnectStore()

      loginConnectStore.setUserFlag('isLoggedIn', true)
      loginConnectStore.setProjectFlag('isProjectConnected', true)
      loginConnectStore.setHasInitiallyLoaded()
    })

    function mountTestRun (runName: string) {
      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        onResult: (result) => {
          if (result.currentProject?.cloudProject?.__typename === 'CloudProject') {
            const test = result.currentProject.cloudProject.runByNumber
            const other = CloudRunStubs[runName] as typeof test

            result.currentProject.cloudProject.runByNumber = other
          }
        },
        render: (gqlVal) => {
          return (
            <DebugContainer
              gql={gqlVal}
            />
          )
        },
      })
    }

    context('passed', () => {
      it('renders', () => {
        mountTestRun('allPassing')

        cy.contains('Well Done!').should('be.visible')

        cy.percySnapshot()
      })
    })

    context('errored', () => {
      it('renders', () => {
        mountTestRun('allSkipped')

        cy.contains('The browser server never connected.').should('be.visible')
        cy.contains('2 of 3 specs skipped').should('be.visible')

        cy.percySnapshot()
      })
    })

    context('no tests', () => {
      it('renders', () => {
        mountTestRun('noTests')

        cy.contains('Run has no tests').should('be.visible')

        cy.percySnapshot()
      })
    })

    context('timed out', () => {
      it('renders with CI information', () => {
        mountTestRun('timedOutWithCi')

        cy.contains('Circle CI #1234').should('have.attr', 'href', 'https://circleci.com').should('be.visible')
        cy.contains('Archive this run to remove it').should('be.visible')

        cy.percySnapshot()
      })

      it('renders without CI information', () => {
        mountTestRun('timedOutWithoutCi')

        cy.contains('Circle CI #1234').should('not.exist')
        cy.contains('Archive this run to remove it').should('be.visible')

        cy.percySnapshot()
      })
    })

    context('over limit', () => {
      it('handled usage exceeded', () => {
        mountTestRun('overLimit')

        cy.findByRole('link', { name: 'Contact admin' }).should('have.attr', 'href', 'http://localhost:3000?utmMedium=Debug+Tab&utmSource=Binary%3A+Launchpad')

        cy.percySnapshot()
      })

      it('handles retention exceeded', () => {
        mountTestRun('overLimitRetention')

        cy.findByRole('link', { name: 'Contact admin' }).should('have.attr', 'href', 'http://localhost:3000?utmMedium=Debug+Tab&utmSource=Binary%3A+Launchpad')

        cy.percySnapshot()
      })
    })

    context('cancelled', () => {
      it('renders', () => {
        mountTestRun('cancelled')

        cy.findByTestId('cancelled-by-user-avatar').should('be.visible')
        cy.contains('2 of 3 specs skipped').should('be.visible')
        cy.contains('Test Tester').should('be.visible')

        cy.percySnapshot()
      })
    })
  })

  describe('when logged in and connected', () => {
    let loginConnectStore

    beforeEach(() => {
      loginConnectStore = useLoginConnectStore()

      loginConnectStore.setUserFlag('isLoggedIn', true)
      loginConnectStore.setProjectFlag('isProjectConnected', true)
      loginConnectStore.setHasInitiallyLoaded()
    })

    it('renders running run', () => {
      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        onResult: (result) => {
          if (result.currentProject?.cloudProject?.__typename === 'CloudProject') {
            const test = result.currentProject.cloudProject.runByNumber

            result.currentProject.cloudProject.runByNumber = {
              ...CloudRunStubs.running,
              runNumber: 1,
              completedInstanceCount: 2,
              totalInstanceCount: 3,
            } as typeof test
          }
        },
        render: (gqlVal) => <DebugContainer gql={gqlVal} />,
      })

      cy.findByTestId('debug-header').should('be.visible')
      cy.findByTestId('debug-testing-progress').should('be.visible')
      cy.findByTestId('debug-pending-splash')
      .should('be.visible')
      .within(() => {
        cy.contains('Testing in progress...')
      })
    })

    it('renders running run with failed tests', () => {
      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        onResult: (result) => {
          if (result.currentProject?.cloudProject?.__typename === 'CloudProject') {
            const test = result.currentProject.cloudProject.runByNumber

            result.currentProject.cloudProject.runByNumber = {
              ...CloudRunStubs.failingWithTests,
              status: 'RUNNING',
              runNumber: 1,
              completedInstanceCount: 2,
              totalInstanceCount: 3,
            } as typeof test
          }
        },
        render: (gqlVal) => <DebugContainer gql={gqlVal} />,
      })

      cy.findByTestId('debug-header').should('be.visible')
      cy.findByTestId('debug-testing-progress').should('be.visible')
      cy.findByTestId('debug-spec-item').should('be.visible')
    })

    it('simulates full running run with failed tests', () => {
      //Change this value when modifying this test to allow time to see transitions
      const waitTimeBetweenSimulatedEvents = 0

      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        onResult: (result) => {
          if (result.currentProject?.cloudProject?.__typename === 'CloudProject') {
            const test = result.currentProject.cloudProject.runByNumber

            //creating copy to prevent mutation later on in this test
            const cloudRunCopy = JSON.parse(JSON.stringify(CloudRunStubs.failingWithTests))

            result.currentProject.cloudProject.runByNumber = {
              ...cloudRunCopy,
              status: 'RUNNING',
              runNumber: 1,
              completedInstanceCount: 2,
              totalInstanceCount: 3,
            } as typeof test
          }
        },
        render: (gqlVal) => {
          return <DebugContainer gql={gqlVal} />
        },
      }).then(({ component }) => {
        cy.wrap(component.gql).as('gql')
      })

      /*
        DebugTestingProgress is not mocked here resulting in it always
        saying "0 of 0 specs completed"
        Trying to mock up the DebugTestingProgress here results in
        Urql clearing out and refetching the main query which makes
        this test fail.
      */

      const getRun = (gql: DebugSpecsFragment) => {
        const run = gql.currentProject?.cloudProject?.__typename === 'CloudProject'
        && gql.currentProject.cloudProject.runByNumber

        if (!run) {
          throw Error('Could not find run')
        }

        return run
      }

      cy.findByTestId('debug-header').should('be.visible')
      cy.findByTestId('debug-testing-progress').should('be.visible')

      cy.wait(waitTimeBetweenSimulatedEvents)
      cy.get<DebugSpecsFragment>('@gql').then((gql) => {
        const run = getRun(gql)

        cy.wrap(run).as('run')

        run.totalFailed = 4
        const newTest = JSON.parse(JSON.stringify(run.testsForReview[0]))

        newTest.id = '345'
        newTest.thumbprint = `${newTest.thumbprint}c`

        run.testsForReview.push(newTest)
      })

      cy.wait(waitTimeBetweenSimulatedEvents)
      cy.findAllByTestId('debug-spec-item').should('have.length', 1)
      cy.get<CloudRun>('@run').then((run) => {
        const newSpec: CloudSpecRun = JSON.parse(JSON.stringify(run.specs[0]))

        newSpec.id = 'spec2'
        run.specs.push(newSpec)
        cy.wrap(newSpec).as('newSpec')

        const newSpecTest: CloudTestResult = JSON.parse(JSON.stringify(run.testsForReview[0]))

        newSpecTest.id = '789'
        newSpecTest.thumbprint = `${newSpecTest.thumbprint}d`
        newSpecTest.specId = newSpec.id
        run.testsForReview.push(newSpecTest)

        cy.wrap(newSpecTest).as('newSpecTest')
      })

      cy.wait(waitTimeBetweenSimulatedEvents)
      cy.findAllByTestId('debug-spec-item').should('have.length', 2)
      cy.get<CloudRun>('@run').then((run) => {
        const newGroup = JSON.parse(JSON.stringify(run.groups[0]))

        newGroup.id = 'Group2'
        newGroup.groupName = 'Group-Linux-Electron'
        newGroup.os.name = 'Linux'
        newGroup.os.platform = 'LINUX'
        newGroup.os.version = '16'
        newGroup.os.nameWithVersion = 'Linux 16'
        run.groups.push(newGroup)

        cy.get<CloudSpecRun>('@newSpec').then((newSpec) => {
          newSpec.groupIds!.push(newGroup.id)

          cy.get<CloudTestResult>('@newSpecTest').then((newSpecTest) => {
            const newGroupTest = JSON.parse(JSON.stringify(newSpecTest))

            newGroupTest.instance.groupId = newGroup.id

            run.testsForReview.push(newGroupTest)
          })
        })
      })

      cy.findAllByTestId('debug-spec-item').should('have.length', 2)
      cy.get(':nth-child(2) > [data-cy="debug-spec-item"] > [data-cy="test-group"] > [data-cy="debug-failed-test-groups"]')
      .within(() => {
        cy.findAllByTestId('grouped-row').should('have.length', 2)
      })

      cy.wait(waitTimeBetweenSimulatedEvents)
      cy.get<CloudRun>('@run').then((run) => {
        run.status = 'FAILED'
      })

      cy.findByTestId('debug-testing-progress').should('not.exist')
    })

    it('renders specs and tests when completed run available', () => {
      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        onResult: (result) => {
          if (result.currentProject?.cloudProject?.__typename === 'CloudProject') {
            const test = result.currentProject.cloudProject.runByNumber

            result.currentProject.cloudProject.runByNumber = {
              ...CloudRunStubs.failingWithTests,
            } as typeof test
          }
        },
        render: (gqlVal) => <DebugContainer gql={gqlVal} />,
      })

      // Only asserting that it is rendering the components for failed specs
      cy.findByTestId('debug-header').should('be.visible')
      cy.findByTestId('debug-spec-item').should('be.visible')
    })

    it('renders failed test limit when exceeded', () => {
      cy.mountFragment(DebugSpecsFragmentDoc, {
        variableTypes: DebugSpecVariableTypes,
        variables: {
          hasNextRun: false,
          runNumber: 1,
          nextRunNumber: -1,
        },
        onResult: (result) => {
          if (result.currentProject?.cloudProject?.__typename === 'CloudProject') {
            const test = result.currentProject.cloudProject.runByNumber

            result.currentProject.cloudProject.runByNumber = {
              ...CloudRunStubs.failingWithTests,
              totalFailed: 120,
            } as typeof test
          }
        },
        render: (gqlVal) => <DebugContainer gql={gqlVal} />,
      })

      cy.findByTestId('debug-spec-limit').should('be.visible')
    })

    context('newer relevant run available', () => {
      it('displays newer run with progress when running', () => {
        cy.mountFragment(DebugSpecsFragmentDoc, {
          variableTypes: DebugSpecVariableTypes,
          variables: {
            hasNextRun: false,
            runNumber: 1,
            nextRunNumber: -1,
          },
          onResult: (result) => {
            if (result.currentProject?.cloudProject?.__typename === 'CloudProject') {
              const test = result.currentProject.cloudProject.runByNumber

              result.currentProject.cloudProject.runByNumber = {
                ...CloudRunStubs.failingWithTests,
              } as typeof test

              const nextRun = result.currentProject.cloudProject.nextRun
              const nextCompleted = CloudRunStubs.running as typeof nextRun

              result.currentProject.cloudProject.nextRun = nextCompleted
            }
          },
          render: (gqlVal) => <DebugContainer gql={gqlVal} />,
        })

        cy.findByTestId('newer-relevant-run')
        .should('be.visible')
        .and('contain.text', 'fix: make gql work RUNNING')
        .and('contain.text', '0 of 0 specs completed')
      })

      it('displays newer run with link when complete', () => {
        cy.mountFragment(DebugSpecsFragmentDoc, {
          variableTypes: DebugSpecVariableTypes,
          variables: {
            hasNextRun: false,
            runNumber: 1,
            nextRunNumber: 2,
          },
          onResult: (result) => {
            if (result.currentProject?.cloudProject?.__typename === 'CloudProject') {
              const test = result.currentProject.cloudProject.runByNumber

              result.currentProject.cloudProject.runByNumber = {
                ...CloudRunStubs.failingWithTests,
              } as typeof test

              const nextRun = result.currentProject.cloudProject.nextRun
              const nextCompleted = CloudRunStubs.failingWithTests as typeof nextRun

              result.currentProject.cloudProject.nextRun = nextCompleted
            }
          },
          render: (gqlVal) => <DebugContainer gql={gqlVal} />,
        })

        cy.findByTestId('newer-relevant-run')
        .should('be.visible')
        .and('contain.text', 'fix: make gql work FAILED')
        .and('contain.text', 'Switch to run')
      })
    })
  })

  describe('testing util function: debugMapping', () => {
    it('maps correctly for a single spec', () => {
      const specs = [
        { id: 'a1c', groupIds: ['a'] },
      ] as DebugSpecListSpecFragment[]
      const tests = [
        { specId: 'a1c', id: 'random1', thumbprint: 'unique1' },
        { specId: 'a1c', id: 'random2', thumbprint: 'unique2' },
      ] as DebugSpecListTestsFragment[]
      const groups = [
        { id: 'a', testingType: 'e2e' },
        { id: 'b', testingType: 'e2e' },
      ] as DebugSpecListGroupsFragment[]

      const debugMappingArray = specsList({ specs, tests, groups, localSpecs: [], currentTestingType: 'e2e' })

      expect(debugMappingArray).to.have.length(1)
      expect(debugMappingArray).to.have.eql([
        {
          spec: { id: 'a1c', groupIds: ['a'] },
          tests: { 'unique1': [{ specId: 'a1c', id: 'random1', thumbprint: 'unique1' }], 'unique2': [{ specId: 'a1c', id: 'random2', thumbprint: 'unique2' }] },
          groups: { 'a': { id: 'a', testingType: 'e2e' } },
          foundLocally: false,
          testingType: 'e2e',
          matchesCurrentTestingType: true,
        },
      ])
    })

    it('maps correctly for multiple specs and test', () => {
      const specs = [
        { id: '123', groupIds: ['a'] },
        { id: '456', groupIds: ['b'] },
        { id: '789', groupIds: ['a', 'b'] },
      ] as DebugSpecListSpecFragment[]
      const tests = [
        { specId: '123', id: 'random1', thumbprint: 'unique1' },
        { specId: '456', id: 'random2', thumbprint: 'unique2' },
        { specId: '456', id: 'random3', thumbprint: 'unique3' },
        { specId: '789', id: 'random4', thumbprint: 'unique4' },
        { specId: '123', id: 'random6', thumbprint: 'unique5' },
        { specId: '789', id: 'random7', thumbprint: 'unique4' },
      ] as DebugSpecListTestsFragment[]
      const groups = [
        { id: 'a', testingType: 'e2e' },
        { id: 'b', testingType: 'e2e' },
      ] as DebugSpecListGroupsFragment[]

      const debugMappingArray = specsList({ specs, tests, localSpecs: [], currentTestingType: 'e2e', groups })
      const expectedSpec123 = {
        spec: { id: '123', groupIds: ['a'] },
        tests: { 'unique1': [{ specId: '123', id: 'random1', thumbprint: 'unique1' }], 'unique5': [{ specId: '123', id: 'random6', thumbprint: 'unique5' }] },
        groups: { 'a': { id: 'a', testingType: 'e2e' } },
        foundLocally: false,
        testingType: 'e2e',
        matchesCurrentTestingType: true,
      }

      const expectedSpec456 = {
        spec: { id: '456', groupIds: ['b'] },
        tests: { 'unique2': [{ specId: '456', id: 'random2', thumbprint: 'unique2' }], 'unique3': [{ specId: '456', id: 'random3', thumbprint: 'unique3' }] },
        groups: { 'b': { id: 'b', testingType: 'e2e' } },
        foundLocally: false,
        testingType: 'e2e',
        matchesCurrentTestingType: true,
      }

      const expectedSpec789 = {
        spec: { id: '789', groupIds: ['a', 'b'] },
        tests: { 'unique4': [{ specId: '789', id: 'random4', thumbprint: 'unique4' }, { specId: '789', id: 'random7', thumbprint: 'unique4' }] },
        groups: { 'a': { id: 'a', testingType: 'e2e' }, 'b': { id: 'b', testingType: 'e2e' } },
        foundLocally: false,
        testingType: 'e2e',
        matchesCurrentTestingType: true,
      }

      const expected = [
        expectedSpec123, expectedSpec456, expectedSpec789,
      ]

      expect(debugMappingArray).to.deep.equal(expected)
    })

    it('maps does not show specs that do not have tests', () => {
      const specs = [
        { id: '123', groupIds: ['a'] },
        { id: '456', groupIds: ['a'] },
        { id: '789', groupIds: ['a'] },
      ] as DebugSpecListSpecFragment[]
      const tests = [{ specId: '123', id: 'random1', thumbprint: 'unique1' }] as DebugSpecListTestsFragment[]
      const groups = [{ id: 'a', testingType: 'e2e' }] as DebugSpecListGroupsFragment[]

      const debugMappingArray = specsList({ specs, tests, localSpecs: [], currentTestingType: 'e2e', groups })

      expect(debugMappingArray).to.deep.equal(
        [
          {
            spec: { id: '123', groupIds: ['a'] },
            tests: { 'unique1': [{ specId: '123', id: 'random1', thumbprint: 'unique1' }] },
            groups: { 'a': { id: 'a', testingType: 'e2e' } },
            foundLocally: false,
            testingType: 'e2e',
            matchesCurrentTestingType: true,
          },
        ],
      )
    })

    it('throws an error when a test does not map to a spec', () => {
      const specs = [
        { id: '123', groupIds: ['a'] },
      ] as DebugSpecListSpecFragment[]
      const tests = [
        { specId: '123', id: 'random1' },
        { specId: '456', id: 'random2' },
      ] as DebugSpecListTestsFragment[]
      const groups = [{ id: 'a' }] as DebugSpecListGroupsFragment[]

      const specsListWrapper = () => {
        return specsList({ specs, tests, groups, localSpecs: [], currentTestingType: 'e2e' })
      }

      expect(specsListWrapper).to.throw('Could not find spec for id 456')
    })
  })
})
