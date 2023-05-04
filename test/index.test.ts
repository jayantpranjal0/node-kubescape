import * as fs from 'fs'
import * as path from 'path'
import AbortController from 'abort-controller'

import { KubescapeApi, KubescapeUi, IKubescapeConfig } from '../src/index'

const seconds = (n : number) => n * 1000
const minutes = (n : number) => n * 1000 * 60 

const DEFAULT_KUBESCAPE_VERSION = "v2.3.1";

class TestUi implements KubescapeUi {
    info(msg: string): void {
        console.info(msg)
    }
    error(msg: string): void {
        console.error(msg)
    }
    debug(msg: string): void {
        console.debug(msg)
    }
    showHelp(message: string, url: string): void {
        console.log({
            message : message,
            url : url
        })
    }
    slow<T>(title: string, work: () => Promise<T>): Promise<T> {
        console.log(title)
        return work()
    }
    progress<T>(title: string, cancel: AbortController, work: (progress: (fraction: number) => void) => Promise<T>): Promise<T> {
        let last : number = 0
        return work(fraction => {
            const per = Math.floor(fraction * 100)
            if (per == 100 || per - last >= 30) {
                last = per
                console.log({
                    title : title,
                    progress : per
                })
            }
        })
    }
}

describe('Kubescape Installation', ()=> {
    const tmpdir : string = "tmp"
    const requestedFrameworks = [ "nsa" ] 
    let config : IKubescapeConfig
    let kubescapeApi : KubescapeApi
    let frameworkdir : string

    beforeAll(async()=> {
        fs.mkdirSync(tmpdir, { recursive : true })

        expect(fs.existsSync(tmpdir)).toBeTruthy()

        frameworkdir = `${tmpdir}/frameworks`
        fs.mkdirSync(frameworkdir, { recursive: true })

        expect(fs.existsSync(frameworkdir)).toBeTruthy()

        config = {
            version: DEFAULT_KUBESCAPE_VERSION,
            frameworksDirectory: frameworkdir,
            baseDirectory: tmpdir,
            requiredFrameworks: requestedFrameworks,
            scanFrameworks: requestedFrameworks
        }

        kubescapeApi = KubescapeApi.instance
        
        expect(kubescapeApi).toBeInstanceOf(KubescapeApi)
        
        const successful_setup = await kubescapeApi.setup(new TestUi, config)
        
        expect(successful_setup).toBe(true)
    }, minutes(2))

    it(`Should match version ${DEFAULT_KUBESCAPE_VERSION}`, ()=> {
        expect(kubescapeApi.version).toBe(DEFAULT_KUBESCAPE_VERSION)
    })

    it('Should not be the latest version', ()=> {
        expect(kubescapeApi.isLatestVersion).toBeFalsy()
    })

    it('Should have all the required frameworks', ()=> {
        for (let f of requestedFrameworks) {
            expect(kubescapeApi.frameworksNames).toContain(f)
        }
    })

    it ('Should complete scan #1', async ()=> {
        const priv1Res = await kubescapeApi.scanYaml(new TestUi, './test/assets/priv1.yaml')

        expect(Object.keys(priv1Res).length).toBeGreaterThan(0)
        const resToFramework : any = {}
        priv1Res.forEach((r: { name: string })  => {
            resToFramework[r.name.toLowerCase()] = r
        })

        for (let framework of requestedFrameworks) {

            expect(resToFramework).toHaveProperty(framework.toLowerCase())
        }
    }, minutes(2))

    it ('Should build kubescape command with KUBECONFIG when provided', async() => {
        expect(kubescapeApi._buildKubescapeCommand("scan")).toBe(`\"${kubescapeApi.path}\" scan`)
        expect(kubescapeApi._buildKubescapeCommand("scan", "kubeconfig_path")).toBe(`KUBECONFIG=\"kubeconfig_path\" \"${kubescapeApi.path}\" scan`)

        // mock process platform to test kubescape command for windows
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { get: () => "win32" });
        expect(kubescapeApi._buildKubescapeCommand("scan", "kubeconfig_path")).toBe(`set \"KUBECONFIG=kubeconfig_path\" & \"${kubescapeApi.path}\" scan`)
        Object.defineProperty(process, 'platform', {  
            value: originalPlatform
        })
    })

    afterAll(() => {
        fs.rmdirSync(tmpdir, { recursive: true })

        expect(fs.existsSync(tmpdir)).toBeFalsy()
    })
})
