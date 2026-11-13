import {validateDtmMaterialTargetUrl,type DtmCourseResourceMaterial} from '@/services/dtmCourseResource';
import type {DtmTranslate} from './locale';
import './dtmCourseResource.css';

export function DtmCourseResource({material,t}:{material:DtmCourseResourceMaterial;t:DtmTranslate}){
  const target=material.targetUrl;
  const safe=typeof target==='string'&&target!==''&&validateDtmMaterialTargetUrl(target)===null;
  return <div className="dtm-course-resource">
    <h2>{material.title}</h2>
    <div className="urlworkaround">{safe?<>
      {t('點選 ','Click ')}<a href={target} target="_blank" rel="noopener noreferrer">{target}</a>{t(' 來開啟資源。',' to open the resource.')}
    </>:t('資源連結尚未提供。','Resource link unavailable.')}</div>
  </div>;
}
