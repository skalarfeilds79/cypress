<template>
  <DebugEmptyView
    :title="t('debugPage.emptyStates.debugDirectlyInCypress')"
    :description="t('debugPage.emptyStates.reviewRerunAndDebug')"
    :example-test-name="t('debugPage.emptyStates.notLoggedInTestMessage')"
    :help-link-text="t('debugPage.emptyStates.learnAboutDebugging')"
    :slideshow-campaign="DEBUG_SLIDESHOW.campaigns.login"
    help-link-href="https://on.cypress.io/debug-page"
  >
    <template #cta="slotProps">
      <CloudConnectButton
        utm-medium="Debug Tab"
        :utm-content="slotProps.utmContent"
      />
    </template>
  </DebugEmptyView>
</template>

<script lang="ts" setup>
import DebugEmptyView from './DebugEmptyView.vue'
import { useI18n } from '@cy/i18n'
import CloudConnectButton from '../../runs/CloudConnectButton.vue'
import { DEBUG_SLIDESHOW } from '../utils/constants'

const { t } = useI18n()

</script>
