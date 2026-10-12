frappe.pages['kandil-vacancy-queue'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({parent:wrapper,title:__('Vacancy Queue'),single_column:true});
    const body = $('<div class="p-3"></div>').appendTo(page.body);
    let rows=[], start=0, generation=0;
    let unassigned;
    unassigned = page.add_field({fieldname:'unassigned',label:__('Unassigned only'),fieldtype:'Check',change:()=>{if(!unassigned)return;start=0;load();}});
    page.set_secondary_action(__('Refresh'),load);
    page.set_primary_action(__('Assign selected'),assign);
    function cell(row,value) {$('<td></td>').text(value == null ? '' : String(value)).appendTo(row);}
    async function load() {
        const sequence=++generation;
        body.empty().append($('<p></p>').text(__('Loading vacancies…')));
        try {
            const response=await frappe.call({type:'GET',method:'kandil_hr.recruitment.vacancies.queue',args:{unassigned:unassigned.get_value(),start,limit:50}});
            if(sequence!==generation)return;
            rows=response.message || [];body.empty();
            $('<p class="text-muted"></p>').text(__('Select up to 50 vacancies. The reviewed versions are checked again when you assign them.')).appendTo(body);
            const scroll=$('<div class="table-responsive"></div>').appendTo(body);
            const table=$('<table class="table table-bordered"></table>').appendTo(scroll);
            const head=$('<tr></tr>').appendTo($('<thead></thead>').appendTo(table));
            ['',__('Vacancy'),__('Request'),__('State'),__('Lead Recruiter'),__('Priority'),__('Score details')].forEach(x=>$('<th></th>').text(x).appendTo(head));
            const tbody=$('<tbody></tbody>').appendTo(table);
            rows.forEach((item,index)=>{
                const tr=$('<tr></tr>').appendTo(tbody);
                $('<input type="checkbox">').attr({'data-index':index,'aria-label':__('Select {0}',[item.name])}).appendTo($('<td></td>').appendTo(tr));
                const link=$('<a></a>').text(item.name).appendTo($('<td></td>').appendTo(tr));
                link.attr('href','/desk/job-opening/'+encodeURIComponent(item.name));
                const request=$('<a></a>').text(item.custom_kandil_request).appendTo($('<td></td>').appendTo(tr));
                request.attr('href','/desk/kandil-hiring-request/'+encodeURIComponent(item.custom_kandil_request));
                cell(tr,__(item.custom_kandil_vacancy_state));cell(tr,item.effective_lead||__('Unassigned'));cell(tr,item.priority.score);
                const labels={'classification':__('Classification'),'age':__('Vacancy age'),'due date':__('Required date'),'temporary pin':__('Temporary priority')};
                cell(tr,item.priority.parts.map(p=>(labels[p.reason]||p.reason)+': '+p.points).join(' · '));
            });
            if(!rows.length)$('<p></p>').text(__('No vacancies match this view.')).appendTo(body);
            const nav=$('<div class="d-flex gap-2"></div>').appendTo(body);
            $('<button class="btn btn-default"></button>').text(__('Previous')).prop('disabled',!start).on('click',()=>{start=Math.max(0,start-50);load();}).appendTo(nav);
            $('<button class="btn btn-default"></button>').text(__('Next')).prop('disabled',rows.length<50).on('click',()=>{start+=50;load();}).appendTo(nav);
        } catch(e) {if(sequence===generation)body.empty().append($('<p class="text-danger"></p>').text(__('Unable to load vacancies. Check your access and refresh.')));}
    }
    function assign() {
        const selected=body.find('input:checked').map((_,node)=>rows[Number(node.dataset.index)]).get();
        if(!selected.length)return frappe.msgprint(__('Select at least one vacancy.'));
        const dialog=new frappe.ui.Dialog({title:__('Assign recruiter team'),fields:[
            {fieldname:'lead',label:__('Lead Recruiter'),fieldtype:'Link',options:'User',reqd:1},
            {fieldname:'members',label:__('Additional recruiters'),fieldtype:'Table',fields:[{fieldname:'user',label:__('User'),fieldtype:'Link',options:'User',in_list_view:1,reqd:1}]},
            {fieldname:'reason',label:__('Reason'),fieldtype:'Small Text',reqd:1}],primary_action_label:__('Assign selected'),
            async primary_action(values) {
                dialog.get_primary_btn().prop('disabled',true);
                try {
                    await frappe.call({method:'kandil_hr.recruitment.vacancies.bulk_assign',args:{
                        items:selected.map(x=>({name:x.custom_kandil_request,opening_name:x.name,expected_version:x.expected_version})),
                        lead:values.lead,members:(values.members||[]).map(x=>x.user),reason:values.reason,command_id:dialog.command_id
                    }});
                    dialog.hide();frappe.show_alert({message:__('Recruiter assignments saved.'),indicator:'green'});load();
                } finally {dialog.get_primary_btn().prop('disabled',false);}
            }});
        dialog.command_id=crypto.randomUUID();dialog.show();
    }
    load();
};
