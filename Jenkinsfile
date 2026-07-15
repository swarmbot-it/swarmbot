@Library('jenkins-shared') _

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    parameters {
        choice(name: 'ACTION', choices: ['', 'CI', 'BUILD', 'DEPLOY', 'BUILD_AND_DEPLOY', 'DEPLOY_PROD'], description: 'Empty value enables automatic PR/main branch behavior. DEPLOY_PROD requires manual approval below and always targets PROD regardless of TARGET_ENV.')
        choice(name: 'TARGET_ENV', choices: ['DEV', 'TST'], description: 'Standard job can deploy only to DEV or TST. PROD is only reachable via the DEPLOY_PROD action + approval gate, never auto-selected.')
        string(name: 'IMAGE_TAG', defaultValue: '', description: 'Existing image tag for deploy-only runs. For DEPLOY_PROD this should be a tag already verified in TST.')
        string(name: 'RELEASE_VERSION', defaultValue: '', description: 'Optional release version for image tagging. Empty uses BUILD_NUMBER.')
        booleanParam(name: 'SKIP_TESTS', defaultValue: false, description: 'Skip package test and coverage scripts.')
        booleanParam(name: 'RUN_LLM_REVIEW', defaultValue: false, description: 'Run OpenAI-compatible local LLM review for PR/MR builds.')
    }

    environment {
        INTERNAL_REGISTRY = 'registry.debian.dc4.pl'
        IMAGE_NAMESPACE = 'swarmboty'
        REGISTRY_CREDENTIALS_ID = 'swarm-jenkins'
        SWARM_MANAGER = 'debian@debian.dc4.pl'
        SWARM_DEV_STACK = 'swarmboty-dev'
        SWARM_TST_STACK = 'swarmboty-tst'
        SWARM_PROD_STACK = 'swarmboty-prod'
    }

    stages {
        stage('CI') {
            when {
                anyOf {
                    changeRequest()
                    expression { !params.ACTION || params.ACTION == 'CI' || params.ACTION == 'BUILD_AND_DEPLOY' || params.ACTION == 'BUILD' }
                }
            }
            steps {
                tsCI()
            }
        }

        stage('Build') {
            when {
                not { changeRequest() }
                expression { (!params.ACTION && env.BRANCH_NAME == 'main') || params.ACTION == 'BUILD' || params.ACTION == 'BUILD_AND_DEPLOY' }
            }
            steps {
                tsBuild()
            }
        }

        stage('Deploy') {
            when {
                not { changeRequest() }
                expression { (!params.ACTION && env.BRANCH_NAME == 'main') || params.ACTION == 'DEPLOY' || params.ACTION == 'BUILD_AND_DEPLOY' }
            }
            steps {
                tsDeploy(params.TARGET_ENV ?: 'DEV')
            }
        }

        // PROD is intentionally never reachable through the automatic PR/main
        // path or the DEV/TST TARGET_ENV choice above — it requires an explicit
        // DEPLOY_PROD run plus a human approval, on main only, deploying an
        // IMAGE_TAG that has already gone through TST.
        stage('Approve PROD') {
            when {
                not { changeRequest() }
                allOf {
                    branch 'main'
                    expression { params.ACTION == 'DEPLOY_PROD' }
                }
            }
            steps {
                timeout(time: 24, unit: 'HOURS') {
                    // TODO: restrict with `submitter: '<prod-approvers-group>'` once
                    // that Jenkins group/role is set up; unset = any user with Job
                    // permission can approve, which is the current DEV/TST posture too.
                    input message: "Deploy ${params.IMAGE_TAG ?: env.BUILD_NUMBER} to PRODUCTION (${SWARM_PROD_STACK})?", ok: 'Deploy to PROD'
                }
            }
        }

        stage('Deploy PROD') {
            when {
                not { changeRequest() }
                allOf {
                    branch 'main'
                    expression { params.ACTION == 'DEPLOY_PROD' }
                }
            }
            steps {
                tsDeploy('PROD')
            }
        }
    }
}
