<template>
  <div
    v-if="data.status && data.runNumber"
    data-cy="newer-relevant-run"
    class="w-full"
  >
    <ul
      id="metadata"
      class="border rounded flex flex-wrap bg-indigo-50 border-indigo-100 p-12px gap-8px items-center children:flex children:items-center"
    >
      <li>
        <DebugRunNumber
          :status="data.status"
          :value="data.runNumber"
        />
      </li>
      <li class="font-medium text-sm text-gray-800 truncate">
        {{ data.commitInfo?.summary }}
      </li>
      <li
        v-if="data.status === 'RUNNING'"
        class="font-normal text-sm truncate before-dot"
      >
        <DebugPendingRunCounts
          :specs="specCounts"
        />
      </li>
      <li class="font-normal text-sm truncate before-dot">
        <button
          class="cursor-pointer text-indigo-500 hocus-link hocus-link-default"
          @click="navigateToNewerRun"
        >
          <span v-if="!isPrevious">{{ t('debugPage.switchToRun') }}</span>
          <span v-else>{{ t('debugPage.switchToPreviousRun') }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
<script lang="ts" setup>
import { computed } from 'vue'
import { isNumber } from 'lodash'
import { DebugNewRelevantRunBarFragment, DebugNewRelevantRunBar_MoveToRunDocument, DebugNewRelevantRunBar_SpecsDocument } from '../generated/graphql'
import { gql, useMutation, useSubscription } from '@urql/vue'
import { useI18n } from 'vue-i18n'
import DebugPendingRunCounts from './DebugPendingRunCounts.vue'
import DebugRunNumber from './DebugRunNumber.vue'

gql`
fragment DebugNewRelevantRunBar on CloudRun {
  id
  runNumber
  status
  url
  commitInfo {
    summary
  }
}
`

gql`
mutation DebugNewRelevantRunBar_moveToRun($runNumber: Int!) {
  moveToRelevantRun(runNumber: $runNumber)
}
`

gql`
subscription DebugNewRelevantRunBar_Specs {
  relevantRunSpecChange {
    currentProject {
      id
      relevantRunSpecs {
        next {
          ...DebugPendingRunCounts
        }
      }
    }
  }
}
`

const { t } = useI18n()

const props = defineProps<{
  gql: DebugNewRelevantRunBarFragment
  currentRunNumber: number | null
}>()

const data = computed(() => props.gql)

const shouldPauseSubscription = computed(() => {
  return props.gql.status !== 'RUNNING'
})

const specs = useSubscription({ query: DebugNewRelevantRunBar_SpecsDocument, pause: shouldPauseSubscription })

const specCounts = computed(() => {
  return specs.data.value?.relevantRunSpecChange?.currentProject?.relevantRunSpecs?.next
})

const isPrevious = computed(() => {
  return isNumber(props.currentRunNumber)
    && isNumber(props.gql.runNumber)
    && props.gql.runNumber < props.currentRunNumber
})

const moveToNewRun = useMutation(DebugNewRelevantRunBar_MoveToRunDocument)

function navigateToNewerRun () {
  if (props.gql.runNumber) {
    moveToNewRun.executeMutation({ runNumber: props.gql.runNumber })
  }
}

</script>
<style scoped>
#metadata li.before-dot:before {
  content: '•';
  @apply text-lg text-gray-400 pr-8px
}
</style>
